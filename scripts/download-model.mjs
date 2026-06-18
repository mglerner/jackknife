// Fetch the licensed van glTF into public/ so Vite serves it at /models/van.glb.
// "Van" by jeremy, via Poly Pizza, CC-BY 3.0. node has fetch built in.
import { writeFile, mkdir } from "node:fs/promises";

const URL = "https://static.poly.pizza/3f2dc62d-0f61-4bfc-bb36-5bf5c7d70305.glb";
const DEST = "public/models/van.glb";

await mkdir("public/models", { recursive: true });
const res = await fetch(URL);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
await writeFile(DEST, buf);
console.log("wrote", DEST, buf.length, "bytes");
