import Database from "better-sqlite3";
import { Queries } from "./server/src/db/queries.js";

const db = new Database("data/llm-wiki.db");
const q = new Queries(db);
const pages = q.getAllWikiPages();
console.log(pages.length);
