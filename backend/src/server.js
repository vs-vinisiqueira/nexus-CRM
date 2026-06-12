import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = process.env.PORT || 3001;
const app = createApp();

app.listen(port, () => {
  console.log(`[nexus] API ouvindo em http://localhost:${port}`);
});
