

#  Task Management API

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)

A production-grade REST API for managing teams, project boards, and tasks. Architected with a focus on system design — featuring a strict ticket state machine, Redis caching with cascading invalidation, a polymorphic audit trail with a Diff Engine, and multi-layer Role-Based Access Control.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Key Features](#key-features)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Role-Based Access Control](#role-based-access-control)
- [Ticket State Machine](#ticket-state-machine)
- [Caching Strategy](#caching-strategy)
- [Activity Logging (Diff Engine)](#activity-logging-diff-engine)
- [Getting Started](#getting-started)

---

##  System Architecture

<!-- 💡 IMAGE: A flowchart showing the request lifecycle through your middleware stack.
     Draw this in Excalidraw (excalidraw.com) — free, no account needed.
     Show boxes for: Request → protect → authorize → checkCache → Controller → clearCache → Response
     Add a branch from checkCache showing the Cache Hit path returning early.
     Save as assets/architecture-diagram.png -->
![Architecture Diagram](./assets/architecture.png)

The request lifecycle is designed for high read throughput and strict write integrity:

1. **JWT Auth Middleware** — Secures the route and attaches `req.user`
2. **RBAC Gatekeeper** — Blocks unauthorized roles before touching the database
3. **Cache Interceptor** — Checks Redis. On a Cache Hit ⚡, returns data in <10ms
4. **Prisma Controller** — Executes business logic. Writes are wrapped in Interactive Transactions
5. **Cascading Invalidator** — Clears specific Redis keys to prevent stale data
6. **Global Error Handler** — Catches all exceptions and formats standardized JSON responses

---

## ✨ Key Features

- **4-Tier RBAC** — `ADMIN`, `MANAGER`, `DEVELOPER`, `VIEWER` with route and resource-level enforcement
- **Ticket State Machine** — Enforces valid status transitions and prevents illegal workflow jumps
- **Redis Caching** — Per-user scoped cache keys with automatic cascading invalidation on writes
- **Polymorphic Activity Logging** — Logs board, ticket, and user events with a Diff Engine that records exactly what changed
- **Database Transactions** — All multi-step operations wrapped in Prisma `$transaction` blocks to guarantee data integrity

---

##  Database Schema

<!-- 💡 IMAGE: An ERD (Entity Relationship Diagram) showing all four models.
     Easiest method: Paste your schema.prisma into https://prisma-erd.netlify.app
     It auto-generates a clean diagram in seconds. Screenshot it.
     Save as assets/erd-diagram.png -->
![Database ERD](./assets/er.png)

### Models
- **User** — Stores account info, hashed passwords, and role assignments
- **Board** — A project container owned by a user, holds multiple tickets
- **Ticket** — A task within a board, tracking status, assignee, and creator
- **ActivityLog** — A polymorphic audit log referencing boards, tickets, and users

### Key Design Decisions
- **Polymorphic Audits** — `ActivityLog` uses optional foreign keys (`ticketId?`, `boardId?`) with `onDelete: SetNull`. Audit logs survive even after the parent resource is deleted
- **UUIDs** — All primary keys use UUIDs to prevent sequential ID guessing vulnerabilities

---

##  API Endpoints

### Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new user |
| `POST` | `/api/auth/login` | Public | Login and receive JWT |
| `GET` | `/api/auth/me` | Private | Get current user profile |

### Boards
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/boards` | Private | Get all boards for logged-in user ⚡ Cached |
| `GET` | `/api/boards/:id` | Private | Get a single board with its tickets ⚡ Cached |
| `POST` | `/api/boards` | ADMIN, MANAGER | Create a new board |
| `PUT` | `/api/boards/:id` | ADMIN, MANAGER | Update board details |
| `DELETE` | `/api/boards/:id` | ADMIN only | Destroy board and all its tickets |

### Tickets
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/tickets/board/:boardId` | Private | Get all tickets for a board ⚡ Cached |
| `GET` | `/api/tickets/:id` | Private | Get a single ticket with logs ⚡ Cached |
| `POST` | `/api/tickets` | ADMIN, MANAGER, DEVELOPER | Create a new ticket |
| `PUT` | `/api/tickets/:id` | ADMIN, MANAGER, DEVELOPER | Update ticket via Diff Engine |
| `DELETE` | `/api/tickets/:id` | ADMIN, MANAGER, DEVELOPER* | Delete a ticket |

> *DEVELOPERS can only delete tickets where their `userId` matches the ticket's `createdById` (Resource Ownership).*

### Audit Logs
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/logs/ticket/:ticketId` | Private | Get chronological audit trail for a ticket |
| `GET` | `/api/logs/board/:boardId` | Private | Get chronological audit trail for a board |


---


##  Role-Based Access Control

The system enforces a two-layer security model:

1. **Layer 1 — Middleware** — `authorize(...roles)` blocks unauthorized roles before the controller runs
2. **Layer 2 — Controller** — Ownership checks ensure users can only modify their own resources

---

##  Ticket State Machine

<!-- 💡 IMAGE: A state transition diagram showing all 5 statuses as boxes with arrows.
     Draw in Excalidraw. Show allowed transitions as green arrows, and add a
     red crossed arrow example (BACKLOG → DONE) to show what gets rejected.
     Save as assets/state-machine.png -->
![State Machine](./assets/stateMachine.png)

Tickets can only move between statuses through defined valid transitions. Attempting an invalid transition (e.g., `BACKLOG → DONE`) is rejected with a `400 Bad Request`.

```javascript
const allowedTransitions = {
    'BACKLOG':     ['TODO'],
    'TODO':        ['IN_PROGRESS', 'BACKLOG'],
    'IN_PROGRESS': ['REVIEW', 'TODO'],
    'REVIEW':      ['DONE', 'IN_PROGRESS'],
    'DONE':        ['IN_PROGRESS']
};
```

**Error response on invalid transition:**
```json
{
  "message": "State Machine Error: Cannot move ticket from BACKLOG to DONE. Allowed: TODO"
}
```

---

## ⚡ Caching Strategy


### Cache Keys
| Key Pattern | What it stores |
|---|---|
| `boards:{userId}` | All boards for a specific user |
| `board:{id}` | Single board with its tickets |
| `tickets:board:{boardId}` | All tickets for a board |
| `ticket:{id}` | Single ticket with activity logs |
| `logs:board:{boardId}` | Audit trail for a board |

### Cascading Invalidation
All write operations invoke `clearCache()` to wipe affected keys. For example, updating a ticket clears `ticket:{id}`, `tickets:board:{boardId}`, `board:{boardId}`, and `logs:ticket:{id}` — ensuring the next read always pulls fresh data from PostgreSQL.

Redis failures are caught silently — a Redis outage never fails a request to the client.

---

##  Activity Logging (Diff Engine)

Every meaningful write operation creates an `ActivityLog` entry inside the same Prisma transaction — the operation and its log either both succeed or both fail.

On updates, the **Diff Engine** compares the incoming payload against the current database state and builds a human-readable changelog. If nothing changed, the transaction is skipped entirely.

**Example log output:**
```
"Changed title to 'Build Redis Cache' | Moved from TODO to IN_PROGRESS"
```

| Event | Action String |
|---|---|
| User registered / logged in | `USER_REGISTERED` · `USER_LOGIN` |
| Board created / deleted | `BOARD_CREATED` · `BOARD_DELETED` |
| Ticket created / updated / deleted | `TICKET_CREATED` · `TICKET_UPDATED` · `TICKET_DELETED` |

---

##  Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL
- Redis

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/task-management-api.git
cd task-management-api

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env

# 4. Run database migrations
npx prisma migrate dev --name init

# 5. Start the development server
npm run server
```

### Environment Variables

```env
PORT=5000
DATABASE_URL="postgresql://user:password@localhost:5432/taskmanager"
JWT_SECRET="your_jwt_secret_here"
REDIS_URL="redis://localhost:6379"
NODE_ENV="development"
```

---

##  Author

**Priyanshu** — B.Tech CSE, Netaji Subhas University of Technology  
