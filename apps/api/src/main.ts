import "dotenv/config";
import { createApp } from "./app.js";
createApp()
  .then((app) => app.listen(Number(process.env.PORT || 3001), "0.0.0.0"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
