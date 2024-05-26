import { RPCClient } from "@hansschall/rpc-broker";
import { signal } from "@preact/signals";
// @deno-types=npm:@types/lodash-es
import { merge } from "lodash-es";

console.log(merge({ a: 5 }, { b: 6 }));

const a = new RPCClient();

const b = signal("Working");
export function Foo() {
    return <div>{b} - {a.useNumberSignal("foo", 4)}</div>;
}
