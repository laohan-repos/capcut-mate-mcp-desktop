import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import electronService from "../../services/electronService";
import "./mediaService.less";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

function errorMessage(error) {
  return (error?.message || "操作失败，请重试。").replace(/^Error invoking remote method '[^']+': Error: /, "");
}

export default function MediaServicePanel() {
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [pending, setPending] = useState("");

  async function loadService() {
    setLoading(true);
    setLoadError("");
    try {
      const state = await electronService.getMediaServiceState();
      setService(state);
      setPublicUrl(state?.publicBaseUrl ?? "");
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadService();
  }, []);

  async function runAction(action, operation) {
    setPending(action);
    try {
      await operation();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending("");
    }
  }

  function uploadFiles() {
    return runAction("upload", async () => {
      const result = await electronService.importMediaFiles();
      if (!result) return;
      setService(result.state);
      if (result.imported) toast.success(`已上传 ${result.imported} 个素材`);
      if (result.failures.length) {
        const first = result.failures[0];
        toast.error(`${result.failures.length} 个素材上传失败，${first.name}：${first.message}`);
      }
    });
  }

  async function copyLink(url) {
    try {
      await electronService.clipboardWriteText(url);
      toast.success("已复制素材直链");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function downloadFile(file) {
    return runAction(file.id, async () => {
      if (await electronService.saveMediaFile(file.id)) toast.success("原文件已保存");
    });
  }

  function savePublicUrl(event) {
    event.preventDefault();
    return runAction("public-url", async () => {
      const state = await electronService.setMediaPublicUrl(publicUrl);
      setService(state);
      setPublicUrl(state.publicBaseUrl);
      toast.success("直链设置已保存");
    });
  }

  return (
    <section className="card config-card media-service-card" aria-labelledby="media-service-title">
      <div className="card-body">
        <div className="section-title" id="media-service-title">素材上传与下载</div>

        {loading && <p className="config-hint" role="status">正在连接素材服务…</p>}
        {!loading && loadError && (
          <div className="media-service-toolbar">
            <p className="media-service-error" role="alert">{loadError}</p>
            <button type="button" className="btn btn-small" onClick={loadService}>重试</button>
          </div>
        )}
        {!loading && !loadError && !service && (
          <p className="config-hint">请在剪映小助手桌面客户端中使用素材服务。</p>
        )}
        {service && (
          <>
            <div className="media-service-toolbar">
              <span className="config-path-label">本机服务</span>
              <code className="config-path-value" title={service.localBaseUrl}>{service.localBaseUrl}</code>
              <button type="button" className="btn btn-small config-path-action" onClick={uploadFiles} disabled={Boolean(pending)}>
                <i className="fas fa-upload" aria-hidden="true"></i>
                {pending === "upload" ? "上传中…" : "上传素材"}
              </button>
            </div>

            {service.files.length ? (
              <ul className="media-service-files">
                {service.files.map((file) => (
                  <li className="media-service-file" key={file.id}>
                    <span className="media-service-file-name" title={file.name}>{file.name}</span>
                    <span className="media-service-file-size">{formatSize(file.size)}</span>
                    <button type="button" className="media-service-action" onClick={() => copyLink(file.url)}>
                      {service.publicBaseUrl ? "复制公网直链" : "复制本机直链"}
                    </button>
                    <button type="button" className="media-service-action" onClick={() => downloadFile(file)} disabled={Boolean(pending)}>
                      {pending === file.id ? "下载中…" : "下载"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="config-hint">支持批量上传视频、图片和音频。</p>
            )}

            <details className="media-service-public">
              <summary>公网直链设置</summary>
              <form className="media-service-toolbar" onSubmit={savePublicUrl}>
                <label className="config-path-label" htmlFor="media-public-url">公网地址</label>
                <input
                  id="media-public-url"
                  className="config-path-value media-service-input"
                  type="url"
                  placeholder="https://media.example.com"
                  value={publicUrl}
                  onChange={(event) => setPublicUrl(event.target.value)}
                />
                <button type="submit" className="btn btn-small" disabled={Boolean(pending)}>
                  {pending === "public-url" ? "保存中…" : "保存"}
                </button>
              </form>
              <p className="config-hint">
                使用线上 CapCut Mate 时，请填写已反向代理到本机服务的公网 HTTPS 地址。留空则复制本机地址。
              </p>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
