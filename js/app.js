import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const API_BASE_URL = window.MOVIENEST_API_URL || "http://127.0.0.1:8000";

let currentUser = null;
let currentViewData = {};
let currentAuthMode = "login";

window.updateNavAuthUI = function () {
  const container = document.getElementById("auth-nav-container");
  if (currentUser) {
    container.innerHTML = `
            <div class="flex items-center space-x-3">
                <button onclick="router('profile')" class="text-sm font-medium hover:text-rose-500">My Bookings</button>
                <span class="text-slate-400 text-sm">${currentUser.email}</span>
                <button onclick="handleLogout()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-sm transition">Logout</button>
            </div>
        `;
  } else {
    container.innerHTML = `
            <div class="flex space-x-2">
                <button onclick="openAuthModal('login')" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm">Login</button>
                <button onclick="openAuthModal('signup')" class="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm">Sign Up</button>
            </div>
        `;
  }
};

// Router Handler
// Router Handler
window.router = async function (view, data = null) {
  // If user is not logged in, force the login modal open and block protected views
  if (!currentUser && view !== "login") {
    openAuthModal("login");
    return;
  }

  const appView = document.getElementById("app-view");
  currentViewData = data;

  if (view === "home") {
    appView.innerHTML = `<div class="text-center py-12"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto"></div></div>`;
    const movies = await fetchMovies();
    renderHome(movies);
  } else if (view === "details") {
    renderMovieDetails(data);
  } else if (view === "seats") {
    renderSeatSelection(data);
  } else if (view === "profile") {
    renderUserProfile();
  }
};
async function fetchMovies() {
  const querySnapshot = await getDocs(collection(db, "movies"));
  let movies = [];
  querySnapshot.forEach((doc) => {
    movies.push({ id: doc.id, ...doc.data() });
  });
  return movies;
}

function renderHome(movies) {
  const appView = document.getElementById("app-view");
  appView.innerHTML = `
        <div class="mb-8">
            <h1 class="text-3xl font-extrabold mb-2">Now Showing</h1>
            <p class="text-slate-400">Book tickets for the latest blockbuster movies.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" id="movies-grid">
            ${movies.length === 0 ? '<p class="text-slate-500 col-span-full text-center py-10">No movies found. Add movies via Admin dashboard.</p>' : ""}
        </div>
    `;

  const grid = document.getElementById("movies-grid");
  movies.forEach((movie) => {
    const card = document.createElement("div");
    card.className =
      "bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition cursor-pointer flex flex-col";
    card.onclick = () => router("details", movie);
    card.innerHTML = `
            <img src="${movie.posterUrl || "https://via.placeholder.com/300x450"}" alt="${movie.title}" class="w-full h-80 object-cover">
            <div class="p-4 flex flex-col flex-grow justify-between">
                <div>
                    <h3 class="font-bold text-lg mb-1">${movie.title}</h3>
                    <p class="text-sm text-slate-400">${movie.genre || "Action/Drama"}</p>
                </div>
                <button class="mt-4 w-full bg-rose-600/20 hover:bg-rose-600 text-rose-500 hover:text-white py-2 rounded-lg font-medium transition text-sm">Book Tickets</button>
            </div>
        `;
    grid.appendChild(card);
  });
}

function renderMovieDetails(movie) {
  const appView = document.getElementById("app-view");
  appView.innerHTML = `
        <button onclick="router('home')" class="mb-6 text-sm text-slate-400 hover:text-white flex items-center">&larr; Back to Movies</button>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <img src="${movie.posterUrl}" class="w-full rounded-2xl shadow-xl h-[450px] object-cover" alt="${movie.title}">
            <div class="md:col-span-2 space-y-6">
                <h1 class="text-4xl font-black">${movie.title}</h1>
                <p class="text-slate-300 leading-relaxed">${movie.description || "No description available."}</p>
                
                <div class="border-t border-slate-800 pt-6">
                    <h3 class="text-lg font-bold mb-4">Select Show Date & Time</h3>
                    <div class="flex gap-4 mb-4">
                        <button class="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium">Today</button>
                    </div>
                    <div class="flex gap-3">
                        
                        <button onclick='proceedToSeats(${JSON.stringify(movie)}, "10:00 AM")' class="px-4 py-2 border border-slate-700 hover:border-rose-500 rounded-lg text-sm font-medium transition">10:00 AM</button>
                        <button onclick='proceedToSeats(${JSON.stringify(movie)}, "02:30 PM")' class="px-4 py-2 border border-slate-700 hover:border-rose-500 rounded-lg text-sm font-medium transition">02:30 PM</button>
                        <button onclick='proceedToSeats(${JSON.stringify(movie)}, "07:00 PM")' class="px-4 py-2 border border-slate-700 hover:border-rose-500 rounded-lg text-sm font-medium transition">07:00 PM</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.proceedToSeats = function (movie, timeSlot) {
  if (!currentUser) {
    openAuthModal("login");
    return;
  }
  router("seats", { movie, timeSlot });
};

function renderSeatSelection(data) {
  const appView = document.getElementById("app-view");
  appView.innerHTML = `
        <button onclick="router('home')" class="mb-6 text-sm text-slate-400 hover:text-white">&larr; Cancel Booking</button>
        <div class="max-w-3xl mx-auto bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h2 class="text-xl font-bold mb-1 text-center">Select Your Seats</h2>
            <p class="text-sm text-slate-400 text-center mb-6">Show Time: ${data.timeSlot}</p>
            
            <div class="w-full bg-slate-800 h-2 rounded mb-10 text-center text-xs text-slate-500 uppercase tracking-widest pt-3">Screen This Way</div>
            
            <div class="grid grid-cols-8 gap-3 max-w-md mx-auto mb-8" id="seat-grid"></div>

            <div class="flex justify-center gap-6 mb-6 text-xs text-slate-400">
                <div class="flex items-center gap-2"><div class="w-3 h-3 bg-slate-800 border border-slate-700 rounded"></div> Available</div>
                <div class="flex items-center gap-2"><div class="w-3 h-3 bg-rose-600 rounded"></div> Selected</div>
                <div class="flex items-center gap-2"><div class="w-3 h-3 bg-slate-900 border border-slate-800 text-slate-600 rounded"></div> Occupied</div>
            </div>

            <div class="flex justify-between items-center border-t border-slate-800 pt-6">
                <div>
                    <p class="text-sm text-slate-400">Selected Seats: <span id="selected-seats-count" class="text-white font-bold">0</span></p>
                    <p class="text-lg font-bold text-rose-500">₹<span id="total-price">0</span></p>
                </div>
                <button onclick='initiateRazorpayPayment(${JSON.stringify(data.movie)}, "${data.timeSlot}")' class="bg-rose-600 hover:bg-rose-700 text-white px-8 py-3 rounded-xl font-bold transition shadow-lg shadow-rose-600/20">Proceed to Payment</button>
            </div>
        </div>
    `;

  const seatDocRef = doc(db, "showSeats", `${data.movie.id}_${data.timeSlot}`);

  onSnapshot(seatDocRef, async (docSnap) => {
    let bookedSeats = [];
    if (docSnap.exists()) {
      bookedSeats = docSnap.data().bookedSeats || [];
    }

    const seatGrid = document.getElementById("seat-grid");
    seatGrid.innerHTML = "";
    const rows = ["A", "B", "C", "D"];

    rows.forEach((row) => {
      for (let i = 1; i <= 6; i++) {
        const seatId = `${row}${i}`;
        const isBooked = bookedSeats.includes(seatId);
        const seatBtn = document.createElement("button");

        if (isBooked) {
          seatBtn.className = `p-3 rounded-lg text-xs font-bold bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed opacity-50`;
          seatBtn.innerText = seatId;
          seatBtn.disabled = true;
        } else {
          seatBtn.className = `p-3 rounded-lg text-xs font-bold bg-slate-800 hover:bg-rose-600/30 border border-slate-700 text-slate-300 transition`;
          seatBtn.innerText = seatId;

          seatBtn.onclick = () => {
            seatBtn.classList.toggle("bg-rose-600");
            seatBtn.classList.toggle("text-white");
            seatBtn.classList.toggle("selected-seat");
            updateBookingSummary();
          };
        }
        seatGrid.appendChild(seatBtn);
      }
    });
    updateBookingSummary();
  });
}

function updateBookingSummary() {
  const selected = document.querySelectorAll(".selected-seat");
  const countEl = document.getElementById("selected-seats-count");
  const priceEl = document.getElementById("total-price");

  if (countEl) countEl.innerText = selected.length;
  if (priceEl) priceEl.innerText = selected.length * 200;
}

window.initiateRazorpayPayment = async function (movie, timeSlot) {
  const selected = document.querySelectorAll(".selected-seat");
  if (selected.length === 0) {
    alert("Please select at least one seat.");
    return;
  }

  const seatIds = Array.from(selected).map((el) => el.innerText);

  let order;
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ movie_id: movieId, time_slot: timeSlot, seats: seatIds }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || "Unable to start payment.");
    order = await response.json();
  } catch (err) {
    console.error("Unable to create payment order:", err);
    alert(err.message || "Unable to start payment. Please try again.");
    return;
  }

  const options = {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: "MovieNest",
    description: "Movie Ticket Booking",
    handler: async function (response) {
      const seatDocRef = doc(db, "showSeats", `${movieId}_${timeSlot}`);

      try {
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(seatDocRef);
          let currentBooked = snap.exists()
            ? snap.data().bookedSeats || []
            : [];

          for (let seat of seatIds) {
            if (currentBooked.includes(seat)) {
              throw new Error(
                `Seat ${seat} was just booked by someone else. Please choose another seat.`,
              );
            }
          }

          transaction.set(
            seatDocRef,
            { bookedSeats: [...currentBooked, ...seatIds] },
            { merge: true },
          );
        });

        const bookingData = {
          userEmail: currentUser.email,
          movieId: movieId,
          timeSlot: timeSlot,
          seats: seatIds,
          amount: confirmation.amount,
          paymentId: response.razorpay_payment_id,
        };

        // Generate and download PDF ticket automatically with poster
        await generateTicketPDF(bookingData);

        alert("Payment Successful! Booking Confirmed & PDF downloading.");
        router("profile");
      } catch (err) {
        console.error(err);
        alert(err.message || "Booking conflict detected. Please try again.");
        router("seats", { movie, timeSlot });
      }
    },
    prefill: { email: currentUser.email },
    theme: { color: "#e11d48" },
  };

  var rzp1 = new Razorpay(options);
  rzp1.open();
};

// Helper to convert image URL to Base64 for jsPDF
function getBase64ImageFromUrl(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg"));
    };
    img.onerror = () => resolve(null); // Fallback if image fails to load
    img.src = imageUrl;
  });
}

// Function to create and download the PDF ticket using jsPDF
async function generateTicketPDF(booking) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Dark slate background
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 297, "F");

  // Header Title
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("CINEBOOKING TICKET RECEIPT", 20, 25);

  doc.setFontSize(12);
  doc.setTextColor(244, 63, 94); // Rose accent color
  doc.text("Confirmed Booking Pass", 20, 33);

  doc.setDrawColor(51, 65, 85);
  doc.line(20, 38, 190, 38);

  // Render Movie Image if available
  if (booking.posterUrl) {
    const base64Img = await getBase64ImageFromUrl(booking.posterUrl);
    if (base64Img) {
      doc.addImage(base64Img, "JPEG", 140, 45, 50, 70); // x, y, width, height
    }
  }

  // Movie Name Heading
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(`Movie: ${booking.movieTitle || "N/A"}`, 20, 52);

  // Details List
  doc.setTextColor(203, 213, 225);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let y = 65;
  doc.text(`User Email: ${booking.userEmail}`, 20, y);
  y += 10;
  doc.text(`Showtime Slot: ${booking.timeSlot}`, 20, y);
  y += 10;
  doc.text(`Selected Seats: ${booking.seats.join(", ")}`, 20, y);
  y += 10;
  doc.text(`Total Paid Amount: Rs.${booking.amount}`, 20, y);
  y += 10;
  doc.text(`Razorpay Payment ID: ${booking.paymentId}`, 20, y);
  y += 10;
  doc.text(`Booking Date: ${new Date().toLocaleString()}`, 20, y);

  doc.line(20, 125, 190, 125);
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Please present this ticket confirmation at the entrance counter. Enjoy your movie!",
    20,
    135,
  );

  doc.save(
    `Ticket-${booking.movieTitle ? booking.movieTitle.replace(/\s+/g, "_") : "Booking"}.pdf`,
  );
}

async function renderUserProfile() {
  const appView = document.getElementById("app-view");
  appView.innerHTML = `
        <h1 class="text-3xl font-extrabold mb-6">My Booking History</h1>
        <div class="space-y-4" id="bookings-list">
            <div class="animate-pulse bg-slate-900 h-24 rounded-xl"></div>
        </div>
    `;

  const q = query(
    collection(db, "bookings"),
    where("userId", "==", currentUser.uid),
  );
  const querySnapshot = await getDocs(q);
  const list = document.getElementById("bookings-list");
  list.innerHTML = "";

  if (querySnapshot.empty) {
    list.innerHTML = `<p class="text-slate-500">You haven't made any bookings yet.</p>`;
    return;
  }

  querySnapshot.forEach((docSnap) => {
    const booking = docSnap.data();
    const card = document.createElement("div");
    card.className =
      "bg-slate-900 border border-slate-800 p-6 rounded-xl flex justify-between items-center";
    card.innerHTML = `
            <div>
                <p class="text-xs text-rose-500 font-bold mb-1">Booking ID: ${docSnap.id}</p>
                <h3 class="text-lg font-bold">Time Slot: ${booking.timeSlot}</h3>
                <p class="text-sm text-slate-400">Seats: ${booking.seats.join(", ")}</p>
            </div>
            <div class="text-right">
                <p class="text-lg font-bold">₹${booking.amount}</p>
                <span class="inline-block bg-emerald-500/10 text-emerald-500 text-xs px-2.5 py-1 rounded-full font-medium mt-1">Confirmed</span>
            </div>
        `;
    list.appendChild(card);
  });
}

// Authentication Tab Switcher & Modal Control
window.switchAuthTab = function (mode) {
  currentAuthMode = mode;
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const title = document.getElementById("auth-modal-title");
  const submitBtn = document.getElementById("auth-submit-btn");
  const extraFields = document.getElementById("signup-extra-fields");

  if (mode === "login") {
    tabLogin.className =
      "flex-1 pb-3 text-center font-bold text-rose-500 border-b-2 border-rose-500 transition";
    tabSignup.className =
      "flex-1 pb-3 text-center font-bold text-slate-400 border-b-2 border-transparent transition";
    title.innerText = "Welcome Back";
    submitBtn.innerText = "Sign In";
    extraFields.classList.add("hidden");
    document.getElementById("auth-name").removeAttribute("required");
  } else {
    tabSignup.className =
      "flex-1 pb-3 text-center font-bold text-rose-500 border-b-2 border-rose-500 transition";
    tabLogin.className =
      "flex-1 pb-3 text-center font-bold text-slate-400 border-b-2 border-transparent transition";
    title.innerText = "Create New Account";
    submitBtn.innerText = "Register & Sign Up";
    extraFields.classList.remove("hidden");
    document.getElementById("auth-name").setAttribute("required", "true");
  }
};

window.openAuthModal = function (mode = "login") {
  switchAuthTab(mode);
  document.getElementById("auth-modal").classList.remove("hidden");
};

window.closeAuthModal = function () {
  document.getElementById("auth-modal").classList.add("hidden");
};

window.handleAuthSubmit = async function (e) {
  e.preventDefault();
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;

  if (currentAuthMode === "login") {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      closeAuthModal();
    } catch (err) {
      console.error("Login Error:", err.code);
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        alert(
          "Invalid email or password. Please verify your credentials or create a new account.",
        );
      } else {
        alert("Login Failed: " + err.message);
      }
    }
  } else {
    const name = document.getElementById("auth-name").value;
    const phone = document.getElementById("auth-phone").value;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        email: email,
        phone: phone || "",
        createdAt: new Date(),
      });

      alert("Account created successfully!");
      closeAuthModal();
    } catch (createErr) {
      console.error("Signup Error:", createErr.code);
      if (createErr.code === "auth/email-already-in-use") {
        alert(
          "This email is already registered. Please switch to the Sign In tab.",
        );
      } else {
        alert("Registration Failed: " + createErr.message);
      }
    }
  }
};

window.handleLogout = function () {
  signOut(auth);
};

window.handleGoogleSignIn = async function () {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user profile already exists in Firestore, if not, create it
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        name: user.displayName || "Google User",
        email: user.email,
        phone: user.phoneNumber || "",
        createdAt: new Date(),
      });
    }

    closeAuthModal();
    alert("Successfully signed in with Google!");
  } catch (err) {
    console.error("Google Sign-In Error:", err);
    alert("Google Sign-In Failed: " + err.message);
  }
};
