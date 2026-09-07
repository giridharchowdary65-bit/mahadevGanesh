import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "https://mahadevganesh-api.onrender.com/api";

function App() {

    const [years, setYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState(null);

    const [newYear, setNewYear] = useState("");

    const [photos, setPhotos] = useState([]);

    const [loadingYears, setLoadingYears] = useState(true);
    const [loadingPhotos, setLoadingPhotos] = useState(false);

    const [uploading, setUploading] = useState(false);

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [adminPin, setAdminPin] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);

    const [fullImage, setFullImage] = useState(null);
    async function adminLogin() {
        setMessage("");
        setError("");

        try {
            const response = await fetch(
                `${API_URL}/admin/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        pin: adminPin
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            localStorage.setItem("adminToken", data.token);

            setIsAdmin(true);
            setShowAdminLogin(false);
            setAdminPin("");
            setMessage("Admin mode enabled");
        } catch (error) {
            setError(error.message);
        }
    }


    // ==========================================
    // GET YEARS
    // ==========================================

    async function getYears() {

        try {

            setLoadingYears(true);

            const response =
                await fetch(`${API_URL}/years`);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            setYears(data);

        } catch (error) {

            setError(error.message);

        } finally {

            setLoadingYears(false);

        }

    }


    // ==========================================
    // GET PHOTOS
    // ==========================================

    async function getPhotos(yearId) {

        try {

            setLoadingPhotos(true);
            setError("");

            const response =
                await fetch(`${API_URL}/photos/${yearId}`);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            setPhotos(data);

        } catch (error) {

            setError(error.message);

        } finally {

            setLoadingPhotos(false);

        }

    }
    async function deleteYear(yearId) {

        setMessage("");
        setError("");

        try {

            const response = await fetch(
                `${API_URL}/years/${yearId}`,
                {
                    method: "DELETE",
                    headers: {
                        "x-admin-token":
                            localStorage.getItem("adminToken")
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            setYears(previousYears =>
                previousYears.filter(year => year.id !== yearId)
            );

            if (selectedYear?.id === yearId) {
                setSelectedYear(null);
                setPhotos([]);
            }

            setMessage("Year deleted successfully");

        } catch (error) {
            setError(error.message);
        }
    }


    // ==========================================
    // INITIAL LOAD
    // ==========================================

    useEffect(() => {

        getYears();

    }, []);


    // ==========================================
    // ADD YEAR
    // ==========================================

    async function addYear(event) {

        event.preventDefault();

        setMessage("");
        setError("");

        if (!newYear.trim()) {

            setError("Please enter a year");

            return;
        }

        try {

            const response =
                await fetch(`${API_URL}/years`, {

                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        "x-admin-token": localStorage.getItem("adminToken")
                    },

                    body: JSON.stringify({
                        year: newYear
                    })

                });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            setYears(previousYears => [
                data,
                ...previousYears
            ]);

            setNewYear("");

            setSelectedYear(data);

            setPhotos([]);

            setMessage(`${data.year} added successfully`);

        } catch (error) {

            setError(error.message);

        }

    }


    // ==========================================
    // SELECT YEAR
    // ==========================================

    function selectYear(year) {

        setSelectedYear(year);

        setMessage("");
        setError("");

        getPhotos(year.id);

    }
    async function deletePhoto(photoId) {
        setMessage("");
        setError("");

        try {
            const response = await fetch(
                `${API_URL}/photos/${photoId}`,
                {
                    method: "DELETE",
                    headers: {
                        "x-admin-token": localStorage.getItem("adminToken")
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            // Remove the deleted photo from the screen
            setPhotos(previousPhotos =>
                previousPhotos.filter(photo => photo.id !== photoId)
            );

            // Update the photo count of the selected year
            setYears(previousYears =>
                previousYears.map(year =>
                    year.id === selectedYear.id
                        ? {
                            ...year,
                            photoCount: year.photoCount - 1
                        }
                        : year
                )
            );

            setMessage("Photo deleted successfully");

        } catch (error) {
            setError(error.message);
        }
    }


    // ==========================================
    // UPLOAD PHOTOS
    // ==========================================

    async function uploadPhotos(event) {

        const files = event.target.files;

        if (!files.length || !selectedYear) {
            return;
        }

        setMessage("");
        setError("");
        setUploading(true);

        const formData = new FormData();

        for (const file of files) {

            formData.append("photos", file);

        }

        try {

            const response =
                await fetch(
                    `${API_URL}/photos/${selectedYear.id}`,
                    {
                        method: "POST",
                        body: formData
                    }
                );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            setPhotos(previousPhotos => [
                ...data.photos.map(photo => ({
                    ...photo,
                    year: selectedYear.year
                })),
                ...previousPhotos
            ]);

            setYears(previousYears =>
                previousYears.map(year => {

                    if (year.id === selectedYear.id) {

                        return {
                            ...year,
                            photoCount:
                                year.photoCount + data.photos.length
                        };

                    }

                    return year;

                })
            );

            setSelectedYear(previous => ({
                ...previous,
                photoCount:
                    previous.photoCount + data.photos.length
            }));

            setMessage(
                `${data.photos.length} photo(s) added successfully`
            );

        } catch (error) {

            setError(error.message);

        } finally {

            setUploading(false);

            event.target.value = "";

        }

    }


    return (

        <div className="app">

            {/* ================================= */}
            {/* HEADER */}
            {/* ================================= */}

            <header className="hero">
                <div className="heroIcon">
                    <img src="/myphoto.jpg" alt="Profile" />
                </div>

                <div>
                    <h1>Sri Mahadev Ganesh</h1>
                </div>

                <button
                    className="adminButton"
                    onClick={() => setShowAdminLogin(true)}
                >
                    Admin
                </button>
            </header>
            {showAdminLogin && (
                <div className="adminLogin">
                    <h3>Admin Access</h3>

                    <input
                        type="password"
                        placeholder="Enter admin PIN"
                        value={adminPin}
                        onChange={(event) =>
                            setAdminPin(event.target.value)
                        }
                    />

                    <button onClick={adminLogin}>
                        Unlock
                    </button>

                    <button
                        onClick={() => setShowAdminLogin(false)}
                    >
                        Cancel
                    </button>
                </div>
            )}



            {/* ================================= */}
            {/* ADD YEAR */}
            {/* ================================= */}

            <section className="addYearCard">

                <div className="sectionTitle">


                    <div>
                        <h2>Add a New Year</h2>
                    </div>

                </div>

                <form
                    className="yearForm"
                    onSubmit={addYear}
                >

                    <input
                        type="number"
                        placeholder="Enter year"
                        value={newYear}
                        onChange={(event) =>
                            setNewYear(event.target.value)
                        }
                        min="1900"
                        max="2100"
                    />

                    <button type="submit">
                        <span>+</span>
                        Add Year
                    </button>

                </form>

            </section>


            {/* ================================= */}
            {/* MESSAGE */}
            {/* ================================= */}

            {message && (

                <div className="successMessage">
                    ✓ {message}
                </div>

            )}


            {error && (

                <div className="errorMessage">
                    ⚠ {error}
                </div>

            )}


            {/* ================================= */}
            {/* YEARS */}
            {/* ================================= */}

            <section className="yearsSection">

                <div className="sectionHeading">

                    <div>
                        <h2>Browse Memories</h2>

                    </div>

                    <span className="yearCount">
                        {years.length} Years
                    </span>

                </div>


                {loadingYears ? (

                    <div className="loading">
                        Loading years...
                    </div>

                ) : years.length === 0 ? (

                    <div className="emptyState">

                        <div className="emptyIcon">
                            🗓️
                        </div>

                        <h3>No years yet</h3>

                        <p>
                            Add your first year above to begin
                            building the gallery.
                        </p>

                    </div>

                ) : (

                    <div className="yearsGrid">
                        {years.map(year => (
                            <div
                                key={year.id}
                                className={`yearCard ${selectedYear?.id === year.id ? "active" : ""
                                    }`}
                                onClick={() => selectYear(year)}
                            >
                                <div className="yearNumber">
                                    {year.year}
                                </div>

                                <div className="photoCount">
                                    {year.photoCount} photos
                                </div>

                                {isAdmin && (
                                    <button
                                        type="button"
                                        className="deleteYearButton"
                                        onClick={(event) => {
                                            event.stopPropagation();

                                            if (
                                                window.confirm(
                                                    `Are you sure you want to delete ${year.year} and all its photos?`
                                                )
                                            ) {
                                                deleteYear(year.id);
                                            }
                                        }}
                                    >
                                        🗑️ Delete Year
                                    </button>
                                )}
                            </div>
                        ))}

                    </div>

                )}

            </section>


            {/* ================================= */}
            {/* GALLERY */}
            {/* ================================= */}

            {selectedYear && (
                <section className="gallerySection">
                    <div className="galleryHeader">
                        <div>
                            <span className="galleryLabel">
                                MEMORIES FROM
                            </span>
                            <h2>
                                {selectedYear.year}
                            </h2>
                        </div>
                        <label className="uploadButton">
                            {uploading
                                ? "Uploading..."
                                : "+ Add Photos"}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                multiple
                                onChange={uploadPhotos}
                                disabled={uploading}
                            />
                        </label>
                    </div>
                    {loadingPhotos ? (
                        <div className="loading">
                            Loading photos...
                        </div>
                    ) : photos.length === 0 ? (
                        <div className="emptyState galleryEmpty">
                            <div className="emptyIcon">
                                🖼️
                            </div>
                            <h3>No photos yet</h3>
                            <p>
                                Add some memories to {selectedYear.year}.
                            </p>
                        </div>
                    ) : (
                        <div className="photoGrid">
                            {photos.map(photo => (
                                <div className="photoCard" key={photo.id}>

                                    <img
                                        src={photo.url}
                                        alt={photo.original_name}
                                        onClick={() => setFullImage(photo)}
                                    />

                                </div>
                            ))}
                        </div>
                    )}

                </section>

            )}
            {fullImage && (
                <div
                    className="imageModal"
                    onClick={() => setFullImage(null)}
                >
                    <div
                        className="imageModalContent"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            className="closeImageButton"
                            onClick={() => setFullImage(null)}
                        >
                            ✕
                        </button>

                        <img
                            src={fullImage.url}
                            alt={fullImage.original_name}
                        />

                        <div className="imageActions">

                            <a
                                className="downloadButton"
                                href={`${API_URL}/photos/download/${fullImage.id}`}
                            >
                                ⬇️ Download
                            </a>

                            {isAdmin && (
                                <button
                                    type="button"
                                    className="modalDeleteButton"
                                    onClick={() => {
                                        if (
                                            window.confirm(
                                                "Are you sure you want to delete this photo?"
                                            )
                                        ) {
                                            deletePhoto(fullImage.id);
                                            setFullImage(null);
                                        }
                                    }}
                                >
                                    🗑️ Delete
                                </button>
                            )}

                        </div>
                    </div>
                </div>
            )}

        </div>

    );

}

export default App;