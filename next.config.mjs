/** @type {import("next").NextConfig} */
// NEXT_DIST_DIR separa a pasta de saída: assim um `next build` de verificação não estraga o `next dev` que está rodando em `.next`.
export default process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {};
