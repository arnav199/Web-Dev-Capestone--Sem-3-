# University Campus Management API

Backend Development capstone implementation for **Project 1: University Campus Management System**. This track was selected because the workspace did not contain an existing project or a chosen option. The API supports administrator, faculty and student workflows for users, courses, sections, enrollment, attendance, announcements and reports.

## Features

- Node.js and Express REST API organized into routes, controllers, models, middleware and utilities.
- MongoDB persistence with Mongoose validation, references, compound uniqueness constraints and indexes.
- bcrypt password hashing, short-lived JWT access tokens and rotating, revocable refresh tokens in an HttpOnly cookie; logout also revokes existing access tokens.
- Role protected operations for administrators, faculty and students.
- Attendance marking, correction, student-scoped history and attendance summaries.
- Aggregation reports for low attendance and course/section enrollment counts.
- EventEmitter domain events connected to authenticated Socket.IO notifications.
- Request validation, pagination, filtering, rate limiting, structured JSON errors, Helmet, CORS and request logging.
- Repeatable seed script with sample accounts and academic data.

## Requirements and startup

- Node.js 18 or later and npm.
- MongoDB 6 or later, local or managed.

```powershell
npm install
Copy-Item .env.example .env
# Set strong JWT secrets and the MongoDB connection string in .env
npm run seed
npm run dev
```

The API listens on `http://localhost:3000`; health check: `GET /health`. Use `npm start` for a regular Node process.

Seed users (the demo password for each is `CampusDemo123!`):

| Role | Email |
|---|---|
| Administrator | admin@campus.test |
| Faculty | faculty@campus.test |
| Student | student1@campus.test |
| Student | student2@campus.test |

Change or remove demo credentials before any shared deployment. `.env` is excluded from Git; copy `.env.example` and use unique secrets.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `NODE_ENV` | Runtime mode | `development` |
| `MONGODB_URI` | MongoDB connection | local `campus_management` database |
| `JWT_ACCESS_SECRET` | Access token signing key | Must be set |
| `JWT_REFRESH_SECRET` | Refresh token signing key | Must be set, distinct from access key |
| `ACCESS_TOKEN_TTL` | Access token lifetime | `15m` |
| `REFRESH_TOKEN_DAYS` | Refresh token lifetime | `7` |
| `CLIENT_ORIGIN` | Allowed browser and Socket.IO origin | `http://localhost:5173` |
| `ATTENDANCE_THRESHOLD` | Default low-attendance report threshold | `75` |

## API conventions

Protected routes use `Authorization: Bearer <accessToken>`. Successful results use `{ "success": true, "data": ... }`; list endpoints can include pagination metadata. Errors use `{ "success": false, "error": { "message": ..., "details": ... } }`. List endpoints accept `page` and `limit` (maximum 100); applicable filters include `search`, `role`, `department`, `active`, `course`, `faculty`, `section`, `student`, `status`, `audience` and `term`.

### Authentication

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Self-register a student |
| POST | `/api/auth/login` | Public | Login; returns access token and sets refresh cookie |
| POST | `/api/auth/refresh` | Refresh cookie | Rotate refresh and access tokens |
| POST | `/api/auth/logout` | Public | Revoke refresh token and clear cookie |
| GET | `/api/auth/me` | Any authenticated role | View own profile |
| PATCH | `/api/auth/me` | Any authenticated role | Update own name or department |

### Academic resources

All list and read endpoints below require a valid access token.

| Resource | Endpoints | Access and notes |
|---|---|---|
| Users | `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` | Admin only; account creation is admin-controlled for faculty/admin roles |
| Courses | `GET/POST /api/courses`, `GET/PATCH/DELETE /api/courses/:id` | Read all roles; writes admin only |
| Sections | `GET/POST /api/sections`, `GET/PATCH/DELETE /api/sections/:id` | Read all roles; writes admin only; section links course and faculty |
| Enrollments | `GET/POST /api/enrollments`, `DELETE /api/enrollments/:id` | Students enroll themselves; admin can enroll/remove any student; list admin/faculty |
| Attendance | `GET /api/attendance`, `POST /api/attendance`, `PATCH /api/attendance/:id` | Faculty assigned to section or admin marks/corrects; students see only their own records |
| Attendance summary | `GET /api/attendance/summary` | Student sees self; faculty/admin may request `?studentId=` (faculty limited to their sections) |
| Announcements | `GET/POST /api/announcements`, admin `GET/PATCH/DELETE /api/announcements/:id` | Students see university, enrolled-section and enrolled-course announcements; faculty publishes for assigned sections/courses |

### Reports

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/reports/low-attendance?threshold=75` | Admin/faculty |
| GET | `/api/reports/enrollments` | Admin/faculty |

### Validation and business rules

- Student registration always assigns the `student` role; only an administrator can provision faculty and administrator accounts.
- Faculty can mark or correct attendance only for assigned sections. Students cannot query another student's attendance.
- Every attendance student must have an active enrollment in that section. A unique student/section/session index prevents duplicate class records; marking the same session again updates the record for correction.
- Only enrolled students receive section/course announcements. Faculty cannot publish university-wide announcements.
- Enrollment uniqueness prevents duplicates and section capacity is checked before enrollment.
- Password hashes and refresh token hashes are never returned by API serialization.

## Database design

See [docs/DATABASE.md](docs/DATABASE.md) for collection fields, relationships and indexes. The core relationship is Course → Section → Enrollment/Attendance, with Users referenced as students, faculty and creators. There are separate aggregation pipelines for attendance summaries, configurable low-attendance analysis and section enrollment counts.

## Real-time events

Socket.IO shares the HTTP server and requires an access token in the handshake: `{ "auth": { "token": "<accessToken>" } }`. Invalid/expired tokens are rejected. On connection, clients join their private user room and their enrolled/assigned section rooms.

| Event | Direction | Room | Payload |
|---|---|---|---|
| `announcement:new` | server → client | university broadcast or target section | `{ id, title, body, audience, publishedAt }` |
| `attendance:updated` | server → client | section | `{ section, sessionDate, count }` after mark; `{ recordId, section }` after correction |

The internal EventEmitter decouples announcement/attendance controllers from Socket.IO delivery: `announcement:created`, `attendance:marked`, and `attendance:corrected` are emitted after persistence succeeds.

## API docs and evaluation materials

- [OpenAPI specification](docs/openapi.yaml)
- [Postman collection](postman/Campus-Management.postman_collection.json)
- [Project report](docs/PROJECT_REPORT.md)
- [Database design](docs/DATABASE.md)

Import the Postman collection, set `baseUrl` to `http://localhost:3000`, then log in. The collection includes success, validation, missing-resource, unauthorized, forbidden, duplicate enrollment and attendance summary requests.

## Suggested demo flow

1. Sign in as admin, create a course and section, then create or review student/faculty accounts.
2. Sign in as a student and enroll in the section.
3. Sign in as assigned faculty and post attendance for a date.
4. Sign in as a student to retrieve own attendance and summary; open a Socket.IO client with the student's token to receive section announcements.
5. Sign in as admin/faculty to view the enrollment and low-attendance reports.

## Academic integrity note

This is an implementation scaffold for the selected assignment track. Team members should review and understand the models, route-to-controller flow, aggregation pipelines, token rotation and socket rooms before presenting or submitting it.
