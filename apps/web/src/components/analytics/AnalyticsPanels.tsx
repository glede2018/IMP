import type { ReactNode } from "react";
import { Card } from "antd";
export function Panel({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="dc-panel" title={title} extra={extra}>
      {children}
    </Card>
  );
}
