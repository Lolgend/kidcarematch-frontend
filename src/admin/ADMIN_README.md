# KidCare Match SG — Admin Dashboard

This is a React/Vite dashboard component designed for your existing project. It uses **real API responses**; it does not add sample users, sample reviews, or hard-coded preschool data.

## Included
- Admin access gate based on a protected backend request (`GET /api/v1/admin/users`)
- User list, role filter, and search
- Review moderation (approve/reject) and deletion
- External data source health refresh and ECDA sync
- Subsidy rule list, create, update, and delete
- Admin's own profile and password change / password reset email
- Responsive sidebar layout

## Add to your existing project

1. Copy the `src/admin` folder into your frontend's `src` folder.
2. Check that your Firebase setup exports `auth` from `src/firebase.js`. If your Firebase file is named differently, update the imports in `AdminDashboard.jsx` and `adminApi.js`.
3. Create or update `.env.local` in the frontend root:

   ```env
   VITE_API_BASE_URL=https://YOUR-REACHABLE-API-HOST/api/v1
   ```

   For local development only, if your computer can access the backend private IP, you can use:

   ```env
   VITE_API_BASE_URL=http://10.96.188.205:8000/api/v1
   ```

   A deployed Firebase website cannot normally reach a private `10.x.x.x` API address. The API needs a reachable HTTPS URL and correct CORS settings.

4. In your router or page switch, add the admin page:

   ```jsx
   import AdminDashboard from "./admin/AdminDashboard";

   // Add this route using the routing pattern already in your app:
   <Route path="/admin" element={<AdminDashboard />} />
   ```

   If the app does not use React Router, render `<AdminDashboard />` from your existing page switch when the selected page is `admin`.

5. Install the icon dependency if needed:

   ```powershell
   npm.cmd install lucide-react
   ```

6. Restart Vite after changing `.env.local`:

   ```powershell
   npm.cmd run dev
   ```

## Important backend security requirements

The UI is not a security boundary. Your FastAPI backend must:
- Verify Firebase ID tokens for every admin endpoint.
- Confirm the authenticated account has `role=ADMIN` in the server-side database; never trust an email or role sent from the browser.
- Reject suspended users on all authenticated endpoints.
- Restrict the admin endpoints to active admins.
- Protect the last remaining administrator from being deleted or suspended.

The dashboard uses endpoints present in the supplied Swagger text:
- `GET /admin/users`
- `GET /admin/reviews`
- `PATCH /admin/reviews/{review_id}/status`
- `DELETE /admin/reviews/{review_id}`
- `GET /admin/status`
- `POST /admin/status/refresh`
- `POST /admin/sync/ecda`
- `GET /admin/subsidy-rules`
- `POST /admin/subsidy-rules`
- `PUT /admin/subsidy-rules/{rule_id}`
- `DELETE /admin/subsidy-rules/{rule_id}`

The Swagger file provided does **not** document user edit/suspend/delete endpoints. Those buttons are therefore not falsely presented as working. To complete those actions, add protected backend endpoints first. Similarly, changing your own Firebase profile/password does not change the backend's administrator role.

The admin access check uses the protected users list endpoint because the supplied Swagger does not show an admin `/me` endpoint. If the backend does not validate Firebase tokens on this route yet, implement that server-side before deployment.

## Troubleshooting
- **Access denied:** Your Firebase account needs an ADMIN role in the backend database and the backend must validate the Firebase bearer token.
- **Network/CORS error:** Set `VITE_API_BASE_URL` to a reachable HTTPS backend URL and allow your deployed frontend origin in FastAPI CORS.
- **Build error importing `../firebase`:** Change the two imports to match the actual Firebase module path in your project.
- **Do not make this email-only:** An email allowlist in React is not sufficient to secure admin endpoints.
