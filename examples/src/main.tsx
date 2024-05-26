import { encodeBase64 } from "@std/encoding/base64";
import { render } from "preact";
import { Foo } from "./Foo.tsx";

addEventListener("DOMContentLoaded", () => {
    const el: HTMLDivElement = document.querySelector("#app")!;
    console.log(el);
    for (const $ of el.children) {
        $.remove();
    }
    render(
        <div>
            <Foo></Foo>
        </div>,
        el,
    );
    console.log(encodeBase64("jhk"));
});
