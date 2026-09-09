# MovieNest FastAPI backend

## Run locally

1. Create a Firebase service account in Firebase Console and set `GOOGLE_APPLICATION_CREDENTIALS` to its JSON file, or set `FIREBASE_SERVICE_ACCOUNT_JSON`.
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from Razorpay. The secret must stay on the server.
3. Install dependencies: `python -m pip install -r backend/requirements.txt`
4. Start the API: `python -m uvicorn backend.main:app --reload --port 8000`

The browser expects the API at `http://127.0.0.1:8000`. Set `window.MOVIENEST_API_URL` before `app.js` if deploying elsewhere.
