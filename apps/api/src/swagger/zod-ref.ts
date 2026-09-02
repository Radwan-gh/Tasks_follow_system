/** `$ref` into a schema registered in `schema-registry.ts`, by its registered name. */
export const zodRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Same, wrapped as an OpenAPI array — for list endpoints. */
export const zodArrayRef = (name: string) => ({ type: "array" as const, items: zodRef(name) });
