import { Account, Client, Databases, Storage } from "appwrite";

const client = new Client()
  .setEndpoint("https://sgp.cloud.appwrite.io/v1")
  .setProject("69c4cb210004f8c67249");

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// Database configuration
export const DATABASE_ID = "kidscard_db";
export const COLLECTION_IDS = {
  cards: "cards",
  categories: "categories",
  settings: "settings",
};

// Storage configuration
export const BUCKET_ID = "card_images";

// Appwrite configuration (for constructing URLs)
export const APPWRITE_ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
export const APPWRITE_PROJECT_ID = "69c4cb210004f8c67249";

export { client, account, databases, storage };