import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// 按文件位置定位根目录，兼容从工作区或 API 目录启动。
// 已注入的环境变量优先，Docker 运行时无需打包或挂载密钥文件。
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
