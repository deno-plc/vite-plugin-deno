import { useState } from "preact/hooks";

export function App() {
    const [count, setCount] = useState(0);

    const viteLogo = new URL("/vite.svg", import.meta.url).href;
    const preactLogo = new URL("./assets/preact.svg", import.meta.url).href;
    const denoLogo = new URL("/Deno.svg", import.meta.url).href;

    return (
        <>
            <div>
                <a href="https://vitejs.dev" target="_blank" rel="noopener">
                    <img src={viteLogo} class="logo" alt="Vite logo" />
                </a>
                <a href="https://deno.com" target="_blank" rel="noopener">
                    <img src={denoLogo} class="logo deno" alt="Deno logo" />
                </a>
                <a href="https://preactjs.com" target="_blank" rel="noopener">
                    <img src={preactLogo} class="logo preact" alt="Preact logo" />
                </a>
            </div>
            <h1>Vite + Deno + Preact</h1>
            <div class="card">
                <button onClick={() => setCount((count) => count + 1)}>
                    count is {count}
                </button>
                <p>
                    Edit <code>src/app.tsx</code> and save to test HMR
                </p>
            </div>
        </>
    );
}
