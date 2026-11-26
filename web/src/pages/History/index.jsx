import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import {
  ListGroup,
  Pagination,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";
import {
  CalendarCheckFill,
  CollectionPlayFill,
  ClockHistory,
  Clipboard,
} from "react-bootstrap-icons";

import electronService from "../../services/electronService";
import { formatToDateTime } from "../../utils/date";

import "./index.less";

// 草稿历史记录页面组件
function HistoryPage() {
  const [historyList, setHistoryList] = useState([]);
  const [selectedPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const latestRequest = useRef(0);
  const pageSize = 10;
  const totalPages = Math.ceil(historyList.length / pageSize);
  const currentPage = Math.min(selectedPage, Math.max(totalPages, 1));
  const paginationItems = historyList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const loadHistoryData = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const entries = await electronService.getHistoryRecord();
      if (request === latestRequest.current && Array.isArray(entries)) {
        setHistoryList([...entries].sort((a, b) => new Date(b.time) - new Date(a.time)));
      }
    } catch (error) {
      if (request === latestRequest.current) toast.error("加载历史记录失败");
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => void loadHistoryData();
    const unsubscribe = electronService.onDraftHistoryChanged(refresh);
    window.addEventListener("focus", refresh);
    refresh();
    return () => {
      latestRequest.current += 1;
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [loadHistoryData]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const renderPaginationItems = () => {
    const items = [];
    const maxPagesToShow = 5;
    const halfPagesToShow = Math.floor(maxPagesToShow / 2);

    let startPage = Math.max(1, currentPage - halfPagesToShow);
    let endPage = Math.min(totalPages, currentPage + halfPagesToShow);

    if (currentPage <= halfPagesToShow) {
      endPage = Math.min(totalPages, maxPagesToShow);
    } else if (currentPage + halfPagesToShow >= totalPages) {
      startPage = Math.max(1, totalPages - maxPagesToShow + 1);
    }

    if (startPage > 1) {
      items.push(<Pagination.Ellipsis key="start-ellipsis" />);
    }

    for (let page = startPage; page <= endPage; page++) {
      items.push(
        <Pagination.Item
          key={page}
          active={page === currentPage}
          onClick={() => handlePageChange(page)}
        >
          {page}
        </Pagination.Item>,
      );
    }

    if (endPage < totalPages) {
      items.push(<Pagination.Ellipsis key="end-ellipsis" />);
    }

    return items;
  };

  const copyToClipboard = (text) => {
    if (!text) return;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("已复制到剪贴板");
      })
      .catch((err) => {
        toast.error("复制失败: " + err);
      });
  };

  return (
    <div className="history-page">
      <div className="container">
        {/* 历史记录列表 */}
        <div className="history-list-container">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h3 className="history-list-title">
              <CollectionPlayFill className="me-2" />
              草稿历史记录
            </h3>
          </div>
          <ListGroup>
            {paginationItems.length > 0 ? (
              paginationItems.map((item, index) => (
                <ListGroup.Item
                  key={item.id || `${item.draft_id}-${item.time}`}
                  style={{
                    borderLeft: "none",
                    borderRight: "none",
                    borderTop:
                      index === 0 ? "none" : "1px solid rgba(0,0,0,.125)",
                    borderBottom:
                      index === paginationItems.length - 1
                        ? "none"
                        : "1px solid rgba(0,0,0,.125)",
                    padding: "16px",
                    transition: "all 0.3s ease",
                  }}
                  className="hover-effect"
                >
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div style={{ fontSize: "16px", fontWeight: "500" }}>
                      草稿 #{item.id}
                    </div>
                    {item.status === "downloaded" && (
                      <span className="badge text-bg-success">已保存</span>
                    )}
                    {item.status === "incomplete" && (
                      <span className="badge text-bg-warning">保存不完整</span>
                    )}
                  </div>

                  <div className="draft-detail">
                    <div className="row mt-3">
                      <div className="col-md-6 mb-2">
                        <div className="d-flex align-items-center">
                          <span
                            style={{
                              fontSize: "14px",
                              color: "#666",
                              width: "80px",
                            }}
                          >
                            草稿ID:
                          </span>
                          <span
                            style={{
                              fontSize: "14px",
                              color: "#333",
                              fontFamily: "monospace",
                            }}
                          >
                            {item.draft_id}
                          </span>
                        </div>
                      </div>
                      <div className="col-md-6 mb-2">
                        <div className="d-flex align-items-center">
                          <ClockHistory
                            className="clock-history"
                          />
                          <span style={{ fontSize: "14px", color: "#666" }}>
                            解析时间:{" "}
                          </span>
                          <span
                            style={{
                              fontSize: "14px",
                              color: "#333",
                              fontWeight: "500",
                              marginLeft: "4px",
                            }}
                          >
                            {formatToDateTime(item.time)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="row mt-1">
                      <div className="col-12 mb-2">
                        <OverlayTrigger
                          placement="top"
                          overlay={
                            <Tooltip>{item.draft_url || "暂无地址"}</Tooltip>
                          }
                        >
                          <div className="d-flex align-items-center">
                            <span
                              style={{
                                fontSize: "14px",
                                color: "#666",
                                minWidth: "80px",
                              }}
                            >
                              草稿地址:
                            </span>
                            <span
                              style={{
                                fontSize: "14px",
                                color: item.draft_url ? "#1890ff" : "#999",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "75%",
                              }}
                            >
                              {item.draft_url || "暂无"}
                            </span>
                            {item.draft_url && (
                              <Clipboard
                                className="ms-2"
                                style={{
                                  color: "#356bfd",
                                  cursor: "pointer",
                                  fontSize: "14px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(item.draft_url);
                                }}
                              />
                            )}
                          </div>
                        </OverlayTrigger>
                      </div>
                    </div>
                  </div>
                </ListGroup.Item>
              ))
            ) : (
              <ListGroup.Item className="text-center py-4">
                <div style={{ color: "#666" }}>{isLoading ? "正在读取草稿历史…" : "暂无草稿记录"}</div>
              </ListGroup.Item>
            )}
          </ListGroup>

          {historyList.length > 0 && (
            <div className="d-flex justify-content-between align-items-center mt-4">
              <div className="total-count d-flex align-items-center">
                <CalendarCheckFill
                  className="me-2 clock-history"
                />
                <span style={{ color: "#666" }}>总记录数: </span>
                <span className="history-count">
                  {historyList.length}
                </span>
              </div>

              <Pagination className="pagination">
                <Pagination.First
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                />
                <Pagination.Prev
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                />
                {renderPaginationItems()}
                <Pagination.Next
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                />
                <Pagination.Last
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                />
              </Pagination>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HistoryPage;
