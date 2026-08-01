/** @module Realm */

/** @internal
 * Storage for the values that must be shared by every copy of Loxer's modules inside one
 * JavaScript realm.
 *
 * A module-scoped `const` is one value **per module copy**, and a copy is easy to get without
 * asking for one: Loxer ships two entry points (`loxer` and `loxer/trace`) over one core, a
 * bundler can emit a second shared chunk for them, and a Jest module registry, mixed CJS/ESM
 * resolution or a hoisting quirk produce the same shape. Two copies mean two singletons, so
 * `init()` reaches one while the logs go into the other's pre-init queue and stay there.
 *
 * A slot is anchored on `globalThis` instead, which every copy inside the realm resolves to the
 * same object. Separate realms — a worker, an iframe, an SSR process — keep separate slots, which
 * is correct: sharing across them needs a serialization channel Loxer does not have.
 *
 * This file must stay import-free. `Loxer.ts` imports `Lox.ts`, so anything imported here can
 * close a cycle back onto the module that holds the instance.
 */

/** The realm anchor, keyed on the **major** version. Two majors in one application stay isolated
 * deliberately — a v3 instance must never receive a v4 lox — while every copy of the same major
 * shares one slot record.
 */
const REALM_KEY = Symbol.for('loxer.realm.3');

type RealmSlots = Record<string, unknown>;

/** The slot record used when `globalThis` cannot hold one: a frozen or hardened realm
 * (SES/lockdown, some sandboxes) falls back to module-local values — one instance per copy, which
 * is what a module-scoped `const` gives, never a throw.
 */
const moduleLocalSlots: RealmSlots = {};

/** resolved once per module copy; every copy resolves to the same record */
let resolvedSlots: RealmSlots | undefined;

function isSlotRecord(value: unknown): value is RealmSlots {
  return typeof value === 'object' && value !== null;
}

function resolveSlots(): RealmSlots {
  try {
    const holder = globalThis as unknown as Record<symbol, RealmSlots | undefined>;
    const existing = holder[REALM_KEY];
    if (isSlotRecord(existing)) {
      return Object.isExtensible(existing) ? existing : moduleLocalSlots;
    }
    const created: RealmSlots = {};
    Object.defineProperty(holder, REALM_KEY, {
      value: created,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    // a host that swallows the write instead of throwing leaves the symbol unset
    return holder[REALM_KEY] === created ? created : moduleLocalSlots;
  } catch {
    return moduleLocalSlots;
  }
}

function getSlots(): RealmSlots {
  resolvedSlots ??= resolveSlots();

  return resolvedSlots;
}

/** @internal reads the named realm slot, creating its value on the first copy to ask for it.
 * @param name the slot's key inside the realm record
 * @param create builds the value; called at most once per realm
 * @returns the one value every copy of Loxer in this realm shares
 */
export function realmSlot<T>(name: string, create: () => T): T {
  const slots = getSlots();
  const existing = slots[name];
  if (existing !== undefined) {
    return existing as T;
  }
  const created = create();
  slots[name] = created;

  return created;
}

/** @internal forgets the named slot, so the next {@link realmSlot} call builds a fresh value.
 *
 * Only tests need this: a realm slot deliberately outlives a module-registry reset, so a suite
 * that wants a genuinely new instance has to say so.
 */
export function clearRealmSlot(name: string): void {
  const slots = getSlots();
  slots[name] = undefined;
  moduleLocalSlots[name] = undefined;
}
