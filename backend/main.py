import hashlib
import hmac
import json
import os
import re
from typing import Annotated

import firebase_admin
import razorpay
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import transactional
from pydantic import BaseModel, Field, field_validator

PRICE_PER_SEAT = 200
VALID_TIME_SLOTS = {"10:00 AM", "02:30 PM", "07:00 PM"}
SEAT_PATTERN = re.compile(r"^[A-D][1-6]$")


def init_firebase() -> None:
    if firebase_admin._apps:
        return
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if service_account_json:
        credential = credentials.Certificate(json.loads(service_account_json))
    else:
        credential = credentials.ApplicationDefault()
    firebase_admin.initialize_app(credential)


init_firebase()
db = firestore.client()
app = FastAPI(title="MovieNest API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500").split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


class BookingInput(BaseModel):
    movie_id: str = Field(min_length=1, max_length=200)
    time_slot: str
    seats: list[str] = Field(min_length=1, max_length=6)

    @field_validator("time_slot")
    @classmethod
    def valid_time_slot(cls, value: str) -> str:
        if value not in VALID_TIME_SLOTS:
            raise ValueError("That showtime is not available.")
        return value

    @field_validator("seats")
    @classmethod
    def valid_seats(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value) or not all(SEAT_PATTERN.fullmatch(seat) for seat in value):
            raise ValueError("One or more seats are invalid.")
        return value


class PaymentConfirmation(BookingInput):
    order_id: str = Field(min_length=1)
    payment_id: str = Field(min_length=1)
    signature: str = Field(min_length=1)


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in required.")
    try:
        return firebase_auth.verify_id_token(authorization.removeprefix("Bearer "))
    except (ValueError, firebase_auth.InvalidIdTokenError, firebase_auth.ExpiredIdTokenError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired sign-in token.")


def razorpay_client() -> razorpay.Client:
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        raise HTTPException(status_code=500, detail="Payment service is not configured.")
    return razorpay.Client(auth=(key_id, key_secret))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/orders")
def create_order(payload: BookingInput, user: dict = Depends(get_current_user)) -> dict:
    movie = db.collection("movies").document(payload.movie_id).get()
    if not movie.exists:
        raise HTTPException(status_code=404, detail="Movie not found.")

    order = razorpay_client().order.create(
        {
            "amount": len(payload.seats) * PRICE_PER_SEAT * 100,
            "currency": "INR",
            "receipt": f"movie_{payload.movie_id}_{user['uid']}"[:40],
            "notes": {"movieId": payload.movie_id, "timeSlot": payload.time_slot, "userId": user["uid"]},
        }
    )
    return {
        "orderId": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "keyId": os.environ["RAZORPAY_KEY_ID"],
    }


@app.post("/api/bookings")
def confirm_booking(payload: PaymentConfirmation, user: dict = Depends(get_current_user)) -> dict:
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_secret:
        raise HTTPException(status_code=500, detail="Payment service is not configured.")
    expected_signature = hmac.new(
        key_secret.encode(),
        f"{payload.order_id}|{payload.payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, payload.signature):
        raise HTTPException(status_code=403, detail="Payment verification failed.")

    movie = db.collection("movies").document(payload.movie_id).get()
    if not movie.exists:
        raise HTTPException(status_code=404, detail="Movie not found.")

    seat_ref = db.collection("showSeats").document(f"{payload.movie_id}_{payload.time_slot}")
    booking_ref = db.collection("bookings").document()
    transaction = db.transaction()

    @transactional
    def reserve_seats(transaction):
        seat_snapshot = seat_ref.get(transaction=transaction)
        booked_seats = seat_snapshot.to_dict().get("bookedSeats", []) if seat_snapshot.exists else []
        if any(seat in booked_seats for seat in payload.seats):
            raise HTTPException(status_code=409, detail="One or more selected seats were just booked.")
        booking = {
            "userId": user["uid"],
            "userEmail": user.get("email", ""),
            "movieId": payload.movie_id,
            "timeSlot": payload.time_slot,
            "seats": payload.seats,
            "amount": len(payload.seats) * PRICE_PER_SEAT,
            "paymentId": payload.payment_id,
            "orderId": payload.order_id,
            "status": "confirmed",
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        transaction.set(seat_ref, {"bookedSeats": booked_seats + payload.seats}, merge=True)
        transaction.create(booking_ref, booking)
        return booking

    try:
        booking = reserve_seats(transaction)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail="Booking could not be completed.") from error

    return {"bookingId": booking_ref.id, "amount": booking["amount"]}
