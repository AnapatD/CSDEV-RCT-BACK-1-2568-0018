import 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: int;
      name: string;
    };
  }
}
