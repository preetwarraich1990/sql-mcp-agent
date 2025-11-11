# SQL MCP Agent

An AI-powered SQL agent that connects to a MySQL database and allows natural language queries through OpenAI's GPT models. The agent automatically generates and executes SQL queries for any database schema based on user requests.

## Features

- 🤖 **AI-Powered**: Uses OpenAI's GPT-3.5-turbo to understand natural language queries
- 📊 **Auto Schema Detection**: Dynamically loads database schema and provides context to the AI
- 🔧 **Dynamic SQL Generation**: Auto-generates CREATE, READ, UPDATE, DELETE queries for any table
- 🛡️ **Safe Parameter Handling**: Uses parameterized queries to prevent SQL injection
- 📝 **JSON Response Format**: Structures AI responses as JSON for reliable parsing
- 🎯 **Smart Tool Selection**: Automatically chooses between predefined tools and custom SQL generation
- 🔍 **Complex Queries**: Supports JOINs, aggregations, filtering, and advanced SQL operations
- 🌐 **RESTful API**: Easy integration with web applications and services

## Prerequisites

- Node.js (v18 or higher)
- MySQL database (v5.7 or higher)
- OpenAI API key

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/preetwarraich1990/sql-mcp-agent.git
   cd sql-mcp-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the project root:
   ```env
   DATABASE_URL=mysql://root@localhost:3306/users
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Setup the database** (if not already created):
   ```sql
   CREATE DATABASE users;
   
   USE users;
   
   CREATE TABLE User (
     id INT AUTO_INCREMENT PRIMARY KEY,
     email VARCHAR(191) NOT NULL UNIQUE,
     password VARCHAR(191) NOT NULL,
     createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
     updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
   );
   ```

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:password@localhost:3306/users` |
| `OPENAI_API_KEY` | OpenAI API key for GPT models | `sk-proj-...` |

### Database Connection String Format

```
mysql://[username]:[password]@[host]:[port]/[database]
```

- **username**: MySQL user (default: `root`)
- **password**: MySQL password (optional if no password)
- **host**: Database host (default: `localhost`)
- **port**: MySQL port (default: `3306`)
- **database**: Database name (default: `users`)

## Running the Application

Start the server:

```bash
npm start
# or for development with auto-reload
npm run dev
# or directly with node
node server.js
```

Expected output:
```
✅ SQL Agent API running on http://localhost:4000
📝 POST /api/agent - Send natural language SQL requests
🔧 GET /api/tools - View available tools
❤️  GET /api/health - Health check
```

## API Endpoints

### 1. Main Agent: `POST /api/agent`

Send natural language queries to execute SQL operations.

**Request Example:**
```bash
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "show me all users with their todo count"}'
```

### 2. Health Check: `GET /api/health`

Check database connection and get schema information.

```bash
curl http://localhost:4000/api/health
```

### 3. Available Tools: `GET /api/tools`

View all available tools and their parameters.

```bash
curl http://localhost:4000/api/tools
```

## Natural Language Query Examples

The system supports both simple operations (using predefined tools) and complex queries (using AI-generated SQL):

### Simple User Operations (Predefined Tools)

```bash
# Get all users
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "show me all users"}'

# Get a specific user by email
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "find user with email test@example.com"}'

# Create a new user
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "create user with email john@doe.com and password secret123"}'

# Update a user
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "update user john@doe.com password to newsecret456"}'

# Delete a user
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "delete user with email john@doe.com"}'
```

### Complex Queries (AI-Generated SQL)

```bash
# Join users with their todos
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "show me users with their todo items"}'

# Get users with todo count
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "show me all users with their todo count"}'

# Create todo for a specific user
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "create a todo \"Buy groceries\" for user with id 1"}'

# Find users created today
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "find all users created today"}'

# Update specific todo
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "update todo with description \"Buy groceries\" to \"Buy organic groceries\""}'

# Get todos for a specific user
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "show todos for user with email test@example.com"}'

# Delete completed todos
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "delete todos with description containing \"completed\""}'

# Get users who have more than 5 todos
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "show users who have more than 5 todos"}'
```

## Response Format

All responses include:

```json
{
  "schema": "Database schema description",
  "aiCommand": {
    "tool": "toolName", 
    "parameters": {"param": "value"}
  },
  "toolResult": "Query execution result",
  "explanation": "What the query does (for custom SQL)"
}
```

**Example Response:**
```json
{
  "schema": "Table \"User\": id (int), email (varchar(191)), password (varchar(191)), createdAt (datetime(3)), updatedAt (datetime(3))\nTable \"Todo\": id (int), description (varchar(191)), userId (int), createdAt (datetime(3)), updatedAt (datetime(3))",
  "aiCommand": {
    "tool": "executeCustomSQL",
    "parameters": {
      "query": "SELECT u.id, u.email, COUNT(t.id) AS todo_count FROM User u LEFT JOIN Todo t ON u.id = t.userId GROUP BY u.id, u.email",
      "parameters": [],
      "operation": "SELECT"
    }
  },
  "toolResult": {
    "success": true,
    "data": [
      {"id": 1, "email": "test@example.com", "todo_count": 2}
    ],
    "count": 1
  },
  "explanation": "Retrieves all users with the count of todos they have created"
}
```

## Available Tools

The system uses 6 different tools:

### Predefined Tools (for simple User operations)
1. **fetchData** - Get users with optional limit
2. **createUser** - Create a new user record
3. **updateData** - Update user by email
4. **deleteData** - Delete user by email
5. **getUserByEmail** - Get specific user by email

### Dynamic Tool (for complex operations)
6. **executeCustomSQL** - AI-generated SQL for complex queries

## Safety Features

- **SQL Injection Protection**: All queries use parameterized statements
- **Operation Validation**: Ensures queries match expected operations (SELECT, INSERT, UPDATE, DELETE)
- **Dangerous Pattern Detection**: Blocks potentially harmful operations like DROP, TRUNCATE
- **Mass Operation Prevention**: Prevents UPDATE/DELETE without WHERE clauses
- **Schema Validation**: Validates table and column names against actual schema

## Architecture

The system intelligently chooses between:

1. **Predefined Tools**: For simple, common User table operations
2. **AI-Generated SQL**: For complex queries requiring JOINs, aggregations, or operations on multiple tables

This hybrid approach ensures:
- Fast execution for common operations
- Maximum flexibility for complex queries  
- Consistent safety and error handling
- Optimal performance and reliability

## Error Handling

The system provides detailed error messages for:
- Invalid SQL syntax
- Missing required parameters
- Database connection issues
- AI response parsing errors
- Security violations

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check `DATABASE_URL` in `.env`
   - Verify MySQL server is running
   - Ensure database exists

2. **OpenAI API Errors**
   - Verify `OPENAI_API_KEY` in `.env`
   - Check API key permissions and billing
   - Monitor API rate limits

3. **SQL Generation Failures**
   - Ensure your request is clear and specific
   - Check that referenced tables/columns exist
   - Try rephrasing the query

### Debug Mode

Enable verbose logging by setting:
```env
NODE_ENV=development
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review OpenAI API documentation
3. Check MySQL and Node.js documentation
4. Visit the [GitHub repository](https://github.com/preetwarraich1990/sql-mcp-agent)

---

**Made with ❤️ using Express, MySQL, and OpenAI**
