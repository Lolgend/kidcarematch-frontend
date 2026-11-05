# KidCare Match SG frontend

React frontend prototype based on the supplied KidCare Match SG wireframes. Built with React, Vite and CSS (no Tailwind).

## Run locally

1. Install Node.js (LTS).
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm start` (or `npm run dev`).
5. Open http://localhost:3000.

## Included screens

- Home dashboard
- Sign in, sign up and forgot-password demo UI
- Preschool directory with search and filters
- Preschool detail modal, review submission demo and watchlist actions
- Three-factor preschool matching with adjustable weights
- Top-six ranked matching results
- Side-by-side comparison of up to three centres
- Family preference profile with postal code validation
- Watchlist
- Admin dashboard: users, review moderation and external data source status

## Important

All preschool data and admin status are illustrative demo data. The frontend does not yet connect to a backend, Firebase, ECDA/data.gov.sg, OneMap, Gemini or an email service. Replace sample arrays with calls to your Node.js API and enforce authentication, authorization, data validation and review limits on the server.
