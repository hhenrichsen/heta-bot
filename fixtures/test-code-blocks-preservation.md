# Code Block Preservation Test

This document tests that code blocks are treated as single units and not split unless absolutely necessary.

## Small Code Block

This code block should stay together:

```python
def hello_world():
    print("Hello, World!")
    return "success"
```

## Medium Code Block

This slightly larger code block should also stay together:

```javascript
class UserManager {
    constructor(database) {
        this.db = database;
        this.cache = new Map();
    }
    
    async getUser(id) {
        if (this.cache.has(id)) {
            return this.cache.get(id);
        }
        
        const user = await this.db.users.findById(id);
        this.cache.set(id, user);
        return user;
    }
    
    async createUser(userData) {
        const user = await this.db.users.create(userData);
        this.cache.set(user.id, user);
        return user;
    }
}
```

Some text between code blocks to separate them.

## Another Code Block

```sql
SELECT u.id, u.name, u.email, p.avatar, p.bio
FROM users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE u.active = true
  AND u.created_at >= '2023-01-01'
ORDER BY u.created_at DESC
LIMIT 100;
```

Final text after the code blocks.