import { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, message } from 'antd';
import {
  PlayCircleOutlined,
  SendOutlined,
  DownloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import {
  fetchWorks,
  statusMap,
  distributeStatusMap,
} from '@/services/ui-api';
import { reportError } from '@/services/ui-api';
import type { Work } from '@/types/ui';
import MediaPreview from '@/components/MediaPreview';
import type { Asset } from '@/types';
import DistributeModal from '@/components/DistributeModal';

/**
 * 我的作品页
 * 状态筛选 Tab + 作品表格（缩略图/状态/分发状态）+ 去分发弹窗
 */
export default function Works() {
  const [preview, setPreview] = useState<Asset | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [distributeModalOpen, setDistributeModalOpen] = useState(false);
  const [, setDistributingWorkId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try { setWorks(await fetchWorks()); }
    catch (e) { reportError(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadData();
  }, []);

  const statusTabs = [
    { key: 'all', label: '全部' },
    { key: 'draft', label: '排队中' },
    { key: 'generating', label: '生成中' },
    { key: 'published', label: '已完成' },
    { key: 'failed', label: '失败' },
  ];

  const filteredWorks = activeStatus === 'all' ? works : works.filter((w) => w.status === activeStatus || (activeStatus === 'published' && w.status === 'approved') || (activeStatus === 'failed' && w.status === 'rejected'));

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  const handleDistribute = (workId: string) => {
    setDistributingWorkId(workId);
    setDistributeModalOpen(true);
  };

  const handleConfirmDistribute = (_selectedIds: string[]) => {
    message.info('分发功能将在后续接入。');
  };

  const columns = [
    {
      title: '视频信息',
      dataIndex: 'title',
      key: 'title',
      render: (_: unknown, record: Work) => (
        <div className="flex items-center gap-4">
          <div
            style={{
              width: 80,
              height: 48,
              borderRadius: 6,
              background: 'var(--yp-primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--yp-primary-600)',
              flexShrink: 0,
            }}
          >
            <PlayCircleOutlined style={{ fontSize: 24 }} />
          </div>
          <div>
            <p style={{ fontWeight: 500, color: 'var(--yp-neutral-900)', margin: 0 }}>{record.title}</p>
            <p style={{ fontSize: 12, color: 'var(--yp-neutral-500)', margin: 0 }}>
              {record.format} · {record.resolution} · {record.size}MB
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '生成时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string, record: Work) => (
        <div>
          <p style={{ color: 'var(--yp-neutral-800)', margin: 0 }}>{createdAt}</p>
          <p style={{ fontSize: 12, color: 'var(--yp-neutral-500)', margin: 0 }}>
            耗时 {formatDuration(record.duration)}
          </p>
        </div>
      ),
    },
    {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: Work['status']) => {
        const { label, color } = statusMap[status];
        const dotClass =
          status === 'published'
            ? 'yp-status-dot-success'
            : status === 'generating'
            ? 'yp-status-dot-info'
            : status === 'failed'
            ? 'yp-status-dot-error'
            : 'yp-status-dot-warning';
        return (
          <Tag color={color}>
            <span className={`yp-status-dot ${dotClass}`} style={{ marginRight: 6 }}></span>
            {label}
          </Tag>
        );
      },
    },
    {
      title: '分发状态',
      dataIndex: 'distributeStatus',
      key: 'distributeStatus',
      render: (status?: Work['distributeStatus']) => {
        if (!status) return <Tag className="yp-tag-neutral">未分发</Tag>;
        const info = distributeStatusMap[status];
        return <Tag className={info.tagClass}>{info.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: Work) => (
        <Space>
          <Button type="text" size="small" icon={<DownloadOutlined />} aria-label="下载作品" href={record.downloadUrl} />
          <Button type="text" size="small" icon={<EyeOutlined />} aria-label="预览作品" onClick={() => setPreview(record.asset)} />
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            onClick={() => handleDistribute(record.id)}
          >
            分发
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>我的生成作品</h1>
        <p>管理已生成视频并分发到各平台矩阵账号</p>
      </div>

      {/* 工具栏 */}
      <div className="yp-card p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 状态标签 */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--yp-neutral-100)', width: 'fit-content' }}>
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
                style={{
                  padding: '6px 16px',
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeStatus === tab.key ? 'var(--yp-card)' : 'transparent',
                  color: activeStatus === tab.key ? 'var(--yp-neutral-900)' : 'var(--yp-neutral-600)',
                  boxShadow: activeStatus === tab.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* 批量操作栏 */}
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 14, color: 'var(--yp-neutral-600)' }}>
              已选择 <strong style={{ color: 'var(--yp-neutral-900)' }}>{selectedRowKeys.length}</strong> 项
            </span>
            <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => setDistributeModalOpen(true)}>
              一键分发
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => {
              const selected=works.filter(w=>selectedRowKeys.includes(w.id));
              if(!selected.length){message.info('请先选择作品');return;}
              selected.forEach(w=>{const a=document.createElement('a');a.href=w.downloadUrl;a.download='';document.body.appendChild(a);a.click();a.remove();});
            }}>
              下载
            </Button>
          </div>
        </div>
      </div>

      {/* 作品列表 */}
      <div className="yp-card overflow-hidden">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredWorks}
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 条作品` }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            
          }}
        />
      </div>

      <MediaPreview asset={preview} onClose={() => setPreview(null)} />
      <DistributeModal
        open={distributeModalOpen}
        onCancel={() => {
          setDistributeModalOpen(false);
          setDistributingWorkId(null);
        }}
        onConfirm={handleConfirmDistribute}
      />
    </div>
  );
}
