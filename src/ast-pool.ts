/**
 * @license LGPL-2.1-or-later
 *
 * vite-plugin-deno
 *
 * Copyright (C) 2024 Hans Schallmoser
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301
 * USA or see <https://www.gnu.org/licenses/>.
 */

import type { AstResult, AstTask } from "./ast-worker.ts";
import { assert } from "@std/assert/assert";

export class WorkerPool {
    constructor(readonly concurrency: number) {
        assert(concurrency > 0);
        assert(concurrency % 1 === 0); // int
        for (let i = 0; i < concurrency; i++) {
            this.#pool.push(this.#spawn_worker());
        }
    }
    #spawn_worker() {
        const worker = new Worker(new URL("./ast-worker.ts", import.meta.url), {
            type: "module",
        });
        worker.addEventListener("message", (ev) => {
            const result = ev.data as AstResult;
            const listener = this.#listener.get(result.task_id);
            listener?.(result);
            this.#listener.delete(result.task_id);

            const waiting = this.#waiting.shift();
            if (waiting) {
                waiting(worker);
            } else {
                this.#free_pool.push(worker);
            }
        });
        this.#free_pool.push(worker);
        return worker;
    }
    #pool: Worker[] = [];
    #free_pool: Worker[] = [];
    #waiting: ((worker: Worker) => void)[] = [];
    #listener = new Map<number, (res: AstResult) => void>();
    #run_task(task: AstTask, worker: Worker): Promise<AstResult> {
        return new Promise((resolve) => {
            this.#listener.set(task.task_id, resolve);
            worker.postMessage(task);
        });
    }
    public run(task: AstTask): Promise<AstResult> {
        const worker = this.#free_pool.shift();
        if (worker) {
            return this.#run_task(task, worker);
        } else {
            return new Promise((resolve) => {
                this.#waiting.push((worker) => {
                    this.#run_task(task, worker).then(resolve);
                });
            });
        }
    }
    #task_id = 0;
    public get_task_id(): number {
        return this.#task_id++;
    }
}
