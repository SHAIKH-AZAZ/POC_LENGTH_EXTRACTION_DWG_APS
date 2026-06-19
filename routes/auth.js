import express from "express";
import { getAccessToken } from "../services/app.js";

const router = express.Router();

router.get("/token", async (req, res) => {
    try {

        const { access_token, expires_in } = await getAccessToken();

        res.json({
            access_token,
            expires_in
        });

    } catch (err) {

        console.error("TOKEN ERROR:", err.message);
        res.status(500).send("Token error");
    }
});

export default router;
