declare module '*?worker' {
  const WorkerFactory: new (options?: WorkerOptions) => Worker;
  export default WorkerFactory;
}
