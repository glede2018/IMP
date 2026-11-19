import { Card } from "antd";
import { BulbOutlined } from "@ant-design/icons";

interface StrategyPlaceholderProps {
  title: string;
  description?: string;
}

/**
 * 策略中心占位页
 * 产品选品策略 / 社媒监控 / 营销内容选题策略 共用
 */
export default function StrategyPlaceholder(_props: StrategyPlaceholderProps) {
  return (
    <div className="space-y-4">
      <Card bordered={false}>
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          style={{ color: "var(--yp-neutral-500)" }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{
              background: "var(--yp-primary-100)",
              color: "var(--yp-primary-600)",
            }}
          >
            <BulbOutlined style={{ fontSize: 28 }} />
          </div>
          <p style={{ margin: 0, fontSize: 14 }}>该模块正在建设中，敬请期待</p>
        </div>
      </Card>
    </div>
  );
}
