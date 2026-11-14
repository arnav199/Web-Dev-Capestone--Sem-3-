# University Campus Management System — Project Report

## Cover page and team details

**Course:** Backend Development Capstone  
**Project:** University Campus Management System (Assignment Project 1)  
**Team members:** Complete with team names and contributions before submission.  
**Technology:** Node.js, Express.js, MongoDB, Mongoose, Socket.IO

## Abstract

This project provides a REST backend for common campus workflows. Administrators maintain users, courses and sections; faculty record attendance and publish academic updates; students enroll and view their own attendance and relevant announcements. MongoDB references represent academic relationships. JWT access/refresh tokens and role checks protect APIs, while aggregation pipelines generate attendance and enrollment analytics. Socket.IO delivers announcement and attendance events to authenticated users in relevant rooms.

## Problem statement and objectives

Academic information often sits in disconnected processes. The system centralizes course and section setup, enrollment, attendance and announcements while ensuring users can access only role-appropriate data.

Objectives:

- Build a layered Express REST API with Mongoose persistence.
- Model student/course/faculty relationships and validate references.
- Apply password hashing, token authentication and role permissions.
- Record attendance without duplicate student-session records and compute percentages.
- Report low attendance and section enrollment through MongoDB aggregation.
- Notify connected clients about relevant campus updates.

## Scope and limitations

Included: user profiles, role administration, courses, sections, enrollment, attendance and correction, announcements, reports, seeded demo data and real-time notifications. The deliverable is a backend API; a frontend, academic timetable, report export and production email delivery are outside the current scope. Refresh tokens are maintained as a single active token per account, so a new login invalidates the prior refresh session.

## Requirements

Functional: role-specific account access; course and section CRUD; enrollment; attendance marking/history/summary; announcements; low-attendance and enrollment reports; real-time announcement/attendance updates.

Non-functional: JSON REST conventions, input validation, bounded pagination, centralized errors, unique constraints, secure password storage, environment configuration, request logging, and authenticated real-time connections.

## Architecture and request flow

The implementation separates route definitions, request validation, controllers, Mongoose models and shared middleware. A request flows through Express security/logging middleware, route-level authentication and validation, controller business rules, Mongoose persistence and a consistent JSON response. Domain events are emitted after successful database writes; an EventEmitter listener forwards selected events through Socket.IO.

## Modules

- **Authentication:** student self-registration, admin provisioning, login, JWT access token, refresh rotation and logout revocation.
- **User/course/section management:** administrative CRUD, faculty assignments and course offerings.
- **Enrollment:** self-enrollment for students, administrator enrollment, duplicate and capacity validation.
- **Attendance:** faculty section authorization, enrollment checks, daily records, correction notes and student privacy.
- **Announcements:** university, section and course audiences; student visibility is limited to relevant audiences.
- **Analytics:** attendance summary, low-attendance report and enrollment report.
- **Realtime:** authenticated Socket.IO socket and user/section rooms.

## Database design

See [DATABASE.md](DATABASE.md) for collection fields, relationship diagram, indexes and aggregation descriptions. Compound unique indexes enforce enrollment and attendance session uniqueness at the database level.

## Authentication and authorization

Passwords are hashed with bcryptjs (12 rounds). Access JWTs contain subject, role and an account token version and expire after the configured short lifetime. Refresh JWTs are HttpOnly cookies and their SHA-256 hashes are stored per user; refresh rotates the token, while logout removes its stored hash and increments the account token version to revoke existing access tokens. Protected REST middleware validates the access token and reloads the active user. Route-level RBAC and controller checks enforce role and ownership rules. Socket.IO verifies the access token in the handshake and places users into authorized section rooms.

## API documentation

See [openapi.yaml](openapi.yaml) and the root README for endpoint tables, access roles, request conventions and Socket.IO payloads. The Postman collection is in `postman/Campus-Management.postman_collection.json`.

## Testing strategy and test cases

The included Postman collection is the manual API validation plan. It covers successful login/resource calls, missing required input, unknown IDs, missing/invalid access credentials, role denial, duplicate enrollment and attendance summary. Before final evaluation, execute the collection against a local MongoDB instance and attach screenshots or exported run results to this report. Automated tests are not included in this scaffold.

## Demonstration evidence

Add screenshots or a short demonstration recording after running the API. Recommended evidence: admin creates a section; a student enrolls; faculty marks attendance; student retrieves a personal attendance summary; an authenticated client receives a new section announcement; faculty/admin views analytics.

## Conclusion and future enhancements

The project demonstrates REST API design, layered backend organization, Mongoose modelling, role-based security, aggregation, event-driven notifications and Socket.IO. Future work could add audit history for every attendance correction, CSV exports, timetable management, email notifications, automated API tests and a frontend dashboard.

## References

- Node.js documentation: https://nodejs.org/docs/latest/api/
- Express documentation: https://expressjs.com/
- MongoDB manual: https://www.mongodb.com/docs/manual/
- Mongoose documentation: https://mongoosejs.com/docs/
- Socket.IO documentation: https://socket.io/docs/v4/
