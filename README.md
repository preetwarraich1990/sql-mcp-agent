# SQL MCP Agent

An AI-powered SQL agent that connects to a MySQL database and allows natural language queries through OpenAI's GPT models. The agent automatically executes CRUD operations on the database based on user requests.

## Features

- 🤖 **AI-Powered**: Uses OpenAI's GPT-3.5-turbo to understand natural language queries
- 📊 **Auto Schema Detection**: Dynamically loads database schema and provides context to the AI
- 🔧 **CRUD Operations**: Create, Read, Update, Delete user records via natural language
- 🛡️ **Safe Parameter Handling**: Uses parameterized queries to prevent SQL injection
- 📝 **JSON Response Format**: Structures AI responses as JSON for reliable parsing

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
node server.js
```

Expected output:
```
✅ SQL Agent API running on http://localhost:4000
📝 POST /api/agent - Send SQL queries via AI agent
```

## API Usage

### Endpoint: `POST /api/agent`

Send natural language queries to the AI agent.

**Request Example:**
```bash
curl -X POST http://localhost:4000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a user with email john@example.com and password secret123"}'
```

**Request Body:**
```json
{
  "message": "your natural language query here"
}
```

**Response Example:**
```json
{
  "schema": "Table \"User\": id (int), email (varchar(191)), password (varchar(191)), createdAt (datetime(3)), updatedAt (datetime(3))",
  "aiCommand": {
    "tool": "createUser",
    "parameters": {
      "email": "john@example.com",
      "password": "secret123"
    }
  },
  "toolResult": {
    "success": true,
    "id": 1
  }
}
```

## Available Tools

The AI agent can use the following tools based on your requests:

### 1. **fetchData**
Retrieve users from the database.

**Example Queries:**
- "Get all users"
- "Show me the first 5 users"
- "Fetch user records"

**Parameters:**
- `limit` (optional, number): Maximum records to return (default: 10)

### 2. **createUser**
Create a new user in the database.

**Example Queries:**
- "Create a user with email test@example.com and password pass123"
- "Add a new user: john@example.com with password john123"

**Parameters:**
- `email` (required, string): User's email address
- `password` (required, string): User's password
- `createdAt` (optional, string): Creation timestamp (ISO format)
- `updatedAt` (optional, string): Update timestamp (ISO format)

### 3. **updateData**
Update an existing user's information by email.

**Example Queries:**
- "Update password for john@example.com to newpass123"
- "Change password of test@example.com to secret456"

**Parameters:**
- `email` (required, string): User's email address (used to identify which user to update)
- `password` (optional, string): New password
- `createdAt` (optional, string): New creation timestamp
- `updatedAt` (optional, string): New update timestamp

### 4. **getUserByEmail**
Retrieve a specific user by their email address.

**Example Queries:**
- "Get user john@example.com"
- "Show me the user with email test@example.com"
- "Fetch user details for admin@example.com"

**Parameters:**
- `email` (required, string): User's email address to retrieve

### 5. **deleteData**
Delete a user from the database.

**Example Queries:**
- "Delete user john@example.com"
- "Remove the user with email olduser@example.com"

**Parameters:**
- `email` (required, string): User's email address to delete

## Database Schema

The application works with the `User` table in the `users` database:

```sql
CREATE TABLE User (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
```

### Table Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key, auto-incremented |
| `email` | VARCHAR(191) | User's email address (unique) |
| `password` | VARCHAR(191) | User's password |
| `createdAt` | DATETIME(3) | Record creation timestamp |
| `updatedAt` | DATETIME(3) | Record update timestamp |

## Troubleshooting

### Error: "Cannot find module '@modelcontextprotocol/sdk'"
```bash
npm install @modelcontextprotocol/sdk
```

### Error: "Connection refused to database"
- Check if MySQL is running: `mysql -u root -p -h localhost`
- Verify `DATABASE_URL` in `.env` matches your setup
- Ensure database and table exist

### Error: "401 Unauthorized" from OpenAI
- Verify your `OPENAI_API_KEY` is correct
- Check that your API key has access to GPT-3.5-turbo model

### Error: "Invalid AI response format"
- The AI model didn't return valid JSON
- Try rephrasing your query more clearly
- Check OpenAI API status at https://status.openai.com

### AI Agent asks for table schema
- Make sure your system prompt includes the database schema
- Verify `getDatabaseSchema()` function is working correctly
- Check database connection and permissions

## Project Structure

```
sql-mcp-agent/
├── server.js              # Main application file
├── package.json           # Project dependencies
├── .env                   # Environment variables (create this)
└── README.md             # This file
```

## Dependencies

- `express` - Web framework
- `cors` - Cross-Origin Resource Sharing middleware
- `mysql2/promise` - MySQL database driver
- `dotenv` - Environment variable loader
- `openai` - OpenAI API client
- `@modelcontextprotocol/sdk` - Model Context Protocol

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit `.env` to version control** - Add it to `.gitignore`
2. **Use environment variables** for sensitive data (API keys, database credentials)
3. **Parameterized Queries** - The app uses parameterized queries to prevent SQL injection
4. **Input Validation** - All parameters are cleaned before execution
5. **Password Storage** - Consider hashing passwords before storing (not included in this demo)

## Future Enhancements

- [ ] Add password hashing (bcrypt)
- [ ] Add authentication/authorization
- [ ] Support for more complex queries (joins, aggregations)
- [ ] Rate limiting for API endpoint
- [ ] Query logging and audit trail
- [ ] Support for multiple tables/databases

## License

MIT

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review OpenAI API documentation
3. Check MySQL and Node.js documentation
4. Visit the [GitHub repository](https://github.com/preetwarraich1990/sql-mcp-agent)

---

**Made with ❤️ using Express, MySQL, and OpenAI**
