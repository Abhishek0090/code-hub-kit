declare module "imagetracerjs" {
  interface ImageTracer {
    imagedataToSVG(imageData: ImageData, options?: Record<string, number | string | boolean>): string;
  }
  const tracer: ImageTracer;
  export default tracer;
}
