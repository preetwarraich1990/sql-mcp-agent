import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server";
import OpenAI from "openai";

dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize MySQL pool
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
});

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const mcp = new Server({ name: "SQL Agent", version: "1.0.0" });

// ============================================
// TOOLS DEFINITION
// ============================================



const executeCustomSQLTool = {
  name: "executeCustomSQL",
  description: "Execute a custom SQL query (SELECT, INSERT, UPDATE, DELETE) based on natural language request",
  parameters: { 
    queries: "array", // Array of {query, parameters, operation} objects
    isBulk: "boolean?"
  },
  execute: async ({ queries, isBulk = false }) => {
    try {
      if (!Array.isArray(queries)) {
        return { success: false, error: "Queries must be an array" };
      }

      const results = [];
      
      // Execute queries in sequence (or use transaction for bulk operations)
      if (isBulk && queries.length > 1) {
        // Use transaction for bulk operations
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          
          for (const queryObj of queries) {
            const { query, parameters = [], operation } = queryObj;
            
            // Validate each query
            const validationResult = validateQuery(query, operation);
            if (!validationResult.valid) {
              await connection.rollback();
              return { success: false, error: validationResult.error };
            }
            
            const [result] = await connection.query(query, parameters);
            results.push(formatQueryResult(result, operation));
          }
          
          await connection.commit();
          return { 
            success: true, 
            results, 
            totalQueries: queries.length,
            isBulk: true 
          };
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      } else {
        // Execute single query or multiple queries without transaction
        for (const queryObj of queries) {
          const { query, parameters = [], operation } = queryObj;
          
          // Validate query
          const validationResult = validateQuery(query, operation);
          if (!validationResult.valid) {
            return { success: false, error: validationResult.error };
          }
          
          const [result] = await pool.query(query, parameters);
          results.push(formatQueryResult(result, operation));
        }
        
        return { 
          success: true, 
          results: queries.length === 1 ? results[0] : results,
          totalQueries: queries.length,
          isBulk: false 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// Register tools
mcp.registerCapabilities({ tools: true });
mcp.tools = [executeCustomSQLTool];

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getDatabaseSchema() {
  const [tables] = await pool.query("SHOW TABLES");
  const schema = {};

  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [columns] = await pool.query(`DESCRIBE \`${tableName}\``);
    schema[tableName] = columns.map((col) => ({
      name: col.Field,
      type: col.Type,
      nullable: col.Null === "YES",
      key: col.Key,
    }));
  }
  return schema;
}

function formatSchemaForPrompt(schema) {
  return Object.entries(schema)
    .map(([table, cols]) => {
      const colDesc = cols
        .map((c) => `${c.name} (${c.type}${c.nullable ? ", nullable" : ""})`)
        .join(", ");
      return `Table "${table}": ${colDesc}`;
    })
    .join("\n");
}

function validateQuery(query, operation) {
  // Basic SQL injection protection - ensure query starts with expected operation
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedOperation = operation.toUpperCase();
  
  if (!normalizedQuery.startsWith(normalizedOperation)) {
    return { valid: false, error: `Query does not match expected operation: ${operation}` };
  }

  // Additional safety checks
  const dangerousPatterns = [
    /DROP\s+TABLE/i,
    /DROP\s+DATABASE/i,
    /TRUNCATE/i,
    /ALTER\s+TABLE/i,
    /CREATE\s+TABLE/i,
    /DELETE\s+FROM.*WHERE\s*1\s*=\s*1/i, // Prevent delete all
    /UPDATE.*SET.*WHERE\s*1\s*=\s*1/i    // Prevent update all
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      return { valid: false, error: "Query contains potentially dangerous operations" };
    }
  }

  return { valid: true };
}

function formatQueryResult(result, operation) {
  const normalizedOperation = operation.toUpperCase();
  
  if (normalizedOperation === "SELECT") {
    return { data: result, count: result.length, operation };
  } else if (normalizedOperation === "INSERT") {
    return { insertId: result.insertId, affectedRows: result.affectedRows, operation };
  } else if (normalizedOperation === "UPDATE" || normalizedOperation === "DELETE") {
    return { affectedRows: result.affectedRows, operation };
  }
  
  return { result, operation };
}



async function generateSQLQuery(userMessage, schema) {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You are an expert SQL query generator. Based on the user's natural language request and database schema, generate appropriate SQL queries.

Database schema:
${formatSchemaForPrompt(schema)}

Generate a JSON response with:
{
  "queries": [
    {
      "query": "the SQL query with ? placeholders",
      "parameters": ["value1", "value2"],
      "operation": "SELECT|INSERT|UPDATE|DELETE"
    }
  ],
  "explanation": "brief explanation of what the query does",
  "isBulk": false
}

For multiple operations, set isBulk to true and provide an array of queries.

Rules:
- Always use parameterized queries with ? placeholders for user input
- For INSERT queries, include all required fields and extract values from user message
- For UPDATE/DELETE, always include a WHERE clause to prevent mass operations
- Use proper SQL syntax for MySQL
- Be precise with column names and table names from the schema
- Extract actual parameter values from the user's message (emails, names, IDs, etc.)
- For datetime fields, use MySQL datetime format: 'YYYY-MM-DD HH:MM:SS'
- If user doesn't provide required values, use reasonable defaults or ask for clarification

Examples:
User: "Create user with email john@example.com and password 123456"
Response: {
  "queries": [
    {
      "query": "INSERT INTO User (email, password, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())",
      "parameters": ["john@example.com", "123456"],
      "operation": "INSERT"
    }
  ],
  "explanation": "Creates a new user with the specified email and password",
  "isBulk": false
}

User: "Create two users with email abc@gmail.com and cbd@gmail.co.in"
Response: {
  "queries": [
    {
      "query": "INSERT INTO User (email, password, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())",
      "parameters": ["abc@gmail.com", "defaultpassword123"],
      "operation": "INSERT"
    },
    {
      "query": "INSERT INTO User (email, password, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())",
      "parameters": ["cbd@gmail.co.in", "defaultpassword123"],
      "operation": "INSERT"
    }
  ],
  "explanation": "Creates two new users with the specified email addresses",
  "isBulk": true
}

User: "Find all users created after 2023-01-01"
Response: {
  "queries": [
    {
      "query": "SELECT * FROM User WHERE createdAt > ?",
      "parameters": ["2023-01-01 00:00:00"],
      "operation": "SELECT"
    }
  ],
  "explanation": "Retrieves all users created after January 1, 2023",
  "isBulk": false
}
        `,
      },
      { role: "user", content: userMessage },
    ],
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch (e) {
    throw new Error("Failed to generate SQL query: " + e.message);
  }
}

// ============================================
// API ENDPOINTS
// ============================================

app.post("/api/agent", async (req, res) => {
  try {
    const { message } = req.body;

    // Load database schema
    const schema = await getDatabaseSchema();
    const schemaDescription = formatSchemaForPrompt(schema);

    // Generate custom SQL query for all requests
    const sqlGeneration = await generateSQLQuery(message, schema);
    
    const completion = {
      choices: [{
        message: {
          content: JSON.stringify({
            tool: "executeCustomSQL",
            parameters: {
              queries: sqlGeneration.queries,
              isBulk: sqlGeneration.isBulk || false
            },
            explanation: sqlGeneration.explanation
          })
        }
      }]
    };

    // Parse OpenAI response
    const aiResponse = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (e) {
      console.error("AI response was not valid JSON:", aiResponse);
      return res.status(400).json({
        error: "Invalid AI response format",
        aiResponse,
      });
    }

    // Extract and clean parameters
    const { tool: toolName, parameters } = parsed;
    const cleanParameters = Object.fromEntries(
      Object.entries(parameters || {}).filter(([_, v]) => v !== null && v !== undefined)
    );

    // Special handling for executeCustomSQL to ensure queries array is properly formatted
    if (toolName === "executeCustomSQL" && cleanParameters.queries && !Array.isArray(cleanParameters.queries)) {
      cleanParameters.queries = [];
    }

    // Find and execute tool
    const tool = mcp.tools.find((t) => t.name === toolName);
    if (!tool) {
      return res.status(400).json({
        error: `Unknown tool: ${toolName}`,
        availableTools: mcp.tools.map((t) => t.name),
      });
    }

    const toolResult = await tool.execute(cleanParameters);

    res.json({
      schema: schemaDescription,
      aiCommand: parsed,
      toolResult,
      explanation: parsed.explanation || null,
    });
  } catch (err) {
    console.error("Error in /api/agent:", err);
    
    // Provide more specific error messages
    if (err.message.includes("Failed to generate SQL query")) {
      res.status(400).json({ 
        error: "SQL generation failed", 
        details: err.message,
        suggestion: "Try rephrasing your request with more specific details"
      });
    } else if (err.message.includes("Unknown tool")) {
      res.status(400).json({ 
        error: "Tool not found", 
        details: err.message,
        availableTools: mcp.tools.map(t => t.name)
      });
    } else {
      res.status(500).json({ 
        error: "Internal server error", 
        details: err.message 
      });
    }
  }
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(4000, () => {
  console.log("✅ SQL Agent API running on http://localhost:4000");
});
