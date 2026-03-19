import { defineConfig } from "vite-plus"

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {
    semi: false,
    ignore: ["dist", ".wrangler", "node_modules", ".history"],
  },
})
