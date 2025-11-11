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

const fetchDataTool = {
  name: "fetchData",
  description: "Fetch users from the User table with optional limit",
  parameters: { limit: "number?" },
  execute: async ({ limit = 10 }) => {
    // Convert limit to a number, handle 'all' or non-numeric values
    let limitValue = 10;
    if (limit !== undefined && limit !== null && limit !== "all") {
      limitValue = parseInt(limit, 10);
      if (isNaN(limitValue)) {
        limitValue = 10; // Default to 10 if conversion fails
      }
    } else if (limit === "all") {
      // For 'all', use a very large number
      limitValue = 999999;
    }
    
    const [rows] = await pool.query(
      "SELECT id, email, password, createdAt, updatedAt FROM User LIMIT ?",
      [limitValue]
    );
    return rows;
  },
};

const createUserTool = {
  name: "createUser",
  description: "Create a new User record",
  parameters: {
    email: "string",
    password: "string",
    createdAt: "string?",
    updatedAt: "string?",
  },
  execute: async ({ email, password, createdAt, updatedAt }) => {
    const formatDate = (date) => {
      const d = new Date(date);
      return d.toISOString().slice(0, 23).replace("T", " ").replace("Z", "");
    };

    const now = new Date();
    const [result] = await pool.query(
      "INSERT INTO User (email, password, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
      [
        email,
        password,
        createdAt ? formatDate(createdAt) : formatDate(now),
        updatedAt ? formatDate(updatedAt) : formatDate(now),
      ]
    );
    return { success: true, id: result.insertId };
  },
};

const updateDataTool = {
  name: "updateData",
  description: "Update a User record by email",
  parameters: {
    email: "string",
    password: "string?",
    createdAt: "string?",
    updatedAt: "string?",
  },
  execute: async ({ email, password, createdAt, updatedAt }) => {
    const fields = { password, createdAt, updatedAt };
    const updates = Object.entries(fields)
      .filter(([_, v]) => v !== undefined)
      .map(([k]) => `\`${k}\`=?`);

    if (updates.length === 0) {
      return { success: false, error: "No fields to update" };
    }

    const values = Object.entries(fields)
      .filter(([_, v]) => v !== undefined)
      .map(([_, v]) => v);

    await pool.query(`UPDATE User SET ${updates.join(", ")} WHERE email=?`, [
      ...values,
      email,
    ]);
    return { success: true };
  },
};

const deleteDataTool = {
  name: "deleteData",
  description: "Delete a User record by email",
  parameters: { email: "string" },
  execute: async ({ email }) => {
    await pool.query("DELETE FROM User WHERE email=?", [email]);
    return { success: true };
  },
};

const getUserByEmailTool = {
  name: "getUserByEmail",
  description: "Get a specific user by email address",
  parameters: { email: "string" },
  execute: async ({ email }) => {
    const [rows] = await pool.query(
      "SELECT id, email, password, createdAt, updatedAt FROM User WHERE email=?",
      [email]
    );
    if (rows.length === 0) {
      return { success: false, error: "User not found" };
    }
    return rows[0];
  },
};

// Register tools
mcp.registerCapabilities({ tools: true });
mcp.tools = [fetchDataTool, createUserTool, updateDataTool, deleteDataTool, getUserByEmailTool];

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

// ============================================
// API ENDPOINTS
// ============================================

app.post("/api/agent", async (req, res) => {
  try {
    const { message } = req.body;

    // Load database schema
    const schema = await getDatabaseSchema();
    const schemaDescription = formatSchemaForPrompt(schema);

    // Send user message to OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are an AI SQL agent connected to a MySQL database named "users".

You can ONLY use these tools:
1. fetchData(limit) - Get all users with optional limit
2. getUserByEmail(email) - Get a specific user by email address
3. createUser(email, password, createdAt, updatedAt) - Create a new user
4. updateData(email, password, createdAt, updatedAt) - Update user by email (email is required)
5. deleteData(email) - Delete a user by email

Database schema:
${schemaDescription}

When a user asks something, respond **only** with valid JSON:
{
  "tool": "<toolName>",
  "parameters": { "param1": "value", "param2": "value" }
}

IMPORTANT: 
- For updateData, always include email to identify the user
- Do not send null values, only changed fields
- Do not include "id" in any parameters
- No explanations, only JSON response
          `,
        },
        { role: "user", content: message },
      ],
    });

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
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(4000, () => {
  console.log("✅ SQL Agent API running on http://localhost:4000");
  console.log("📝 POST /api/agent - Send SQL queries via AI agent");
});
