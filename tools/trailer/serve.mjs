// Serve the game's client against the trailer world, to look around by hand: node tools/trailer/serve.mjs
import { startClient } from './lib.mjs';
const { url } = await startClient(5299);
console.log('trailer client at', url);
