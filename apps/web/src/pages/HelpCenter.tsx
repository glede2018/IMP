import { useEffect, useState } from 'react';
import { Card, List, Button } from 'antd';
import {
  PlayCircleOutlined,
  FileTextOutlined,
  CustomerServiceOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { fetchHelpResources } from '@/services/ui-api';
import { reportError } from '@/services/ui-api';
import type { HelpResource } from '@/types/ui';

/**
 * 帮助中心页
 * 操作课程、产品介绍文档、联系我们，对应 Design 原型 page-help-center
 */
export default function HelpCenter() {
  const [resources, setResources] = useState<HelpResource[]>([]);

  useEffect(() => {
    fetchHelpResources().then(setResources).catch(reportError);
  }, []);

  const courses = resources.filter((r) => r.type === 'course');
  const docs = resources.filter((r) => r.type === 'doc');
  const contacts = resources.filter((r) => r.type === 'contact');

  const renderListItem = (item: HelpResource, icon: React.ReactNode) => (
    <div className="flex items-start gap-3 py-1">
      <span style={{ color: 'var(--yp-primary-600)', marginTop: 2 }}>{icon}</span>
      <div>
        <div className="yp-font-medium" style={{ color: 'var(--yp-neutral-900)' }}>
          {item.title}
        </div>
        <div className="yp-text-xs mt-1" style={{ color: 'var(--yp-neutral-500)' }}>
          {item.description}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="yp-page-header">
        <h1>帮助中心</h1>
        <p>获取操作课程、联系支持团队、下载产品资料</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 操作课程 */}
        <Card
          bordered={false}
          title="操作课程"
          className="h-full"
        >
          <List
            dataSource={courses}
            renderItem={(item) => (
              <List.Item>{renderListItem(item, <PlayCircleOutlined />)}</List.Item>
            )}
          />
          <Button block icon={<DownloadOutlined />} className="mt-2">
            上传课程视频
          </Button>
        </Card>

        {/* 联系我们 */}
        <Card bordered={false} title="联系我们" className="h-full">
          <List
            dataSource={contacts}
            renderItem={(item) => (
              <List.Item>{renderListItem(item, <CustomerServiceOutlined />)}</List.Item>
            )}
          />
        </Card>

        {/* 产品介绍文档 */}
        <Card bordered={false} title="产品介绍文档" className="h-full">
          <List
            dataSource={docs}
            renderItem={(item) => (
              <List.Item>{renderListItem(item, <FileTextOutlined />)}</List.Item>
            )}
          />
        </Card>
      </div>
    </div>
  );
}
