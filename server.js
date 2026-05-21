import express from "express";
import cors from "cors";
import authRoute from "./routes/auth.js";
import measurementRoute from "./routes/measurements.js";
import uploadRoute from "./routes/upload.js";
import barLayoutRoute from "./routes/bar-layouts.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use(express.static("public"));

app.use("/api/auth", authRoute);
app.use("/api/measurements", measurementRoute);
app.use("/api/upload", uploadRoute);
app.use("/api/bar-layouts", barLayoutRoute);

const PORT = 3000;

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log("🚀 Server running on http://localhost:3000");
    });
}

export default app;
