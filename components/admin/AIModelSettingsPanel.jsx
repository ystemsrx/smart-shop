import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  Check,
  GripVertical,
  PlugZap,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { IOSToggle } from './products';
import { useSmoothPointerReorder } from './hooks/useSmoothPointerReorder';


let nextModelClientId = 0;

const createModelClientId = () => {
  nextModelClientId += 1;
  return `ai-model-${nextModelClientId}`;
};

const createEmptyModel = () => ({
  _clientId: createModelClientId(),
  model: '',
  model_name: '',
  supports_thinking: false,
  enabled: true,
});

const normalizeModels = (models) => models.map((item) => ({
  model: String(item.model || '').trim(),
  model_name: String(item.model_name || '').trim(),
  supports_thinking: Boolean(item.supports_thinking),
  enabled: item.enabled !== false,
}));

const toEditableModels = (models) => models.map((item) => ({
  ...item,
  _clientId: item._clientId || createModelClientId(),
}));

const editableModels = (models) => models.length > 0 ? toEditableModels(models) : [createEmptyModel()];
const getModelClientId = (item) => item._clientId;

export function AIModelSettingsPanel({ apiRequest }) {
  const [models, setModels] = useState([createEmptyModel()]);
  const [savedModels, setSavedModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState({ type: '', message: '' });
  const [testResults, setTestResults] = useState({});
  const failedAutoSavePayloadRef = useRef('');
  const autoSaveRequestIdRef = useRef(0);

  const applyModelOrder = useCallback((reorderedModels) => {
    failedAutoSavePayloadRef.current = '';
    setModels(reorderedModels);
    setSaveStatus({ type: '', message: '' });
    setTestResults({});
  }, []);

  const {
    containerProps: modelReorderContainerProps,
    getHandleProps: getModelReorderHandleProps,
    getItemProps: getModelReorderItemProps,
    draggingId: draggedModelId,
  } = useSmoothPointerReorder({
    items: models,
    setItems: applyModelOrder,
    getId: getModelClientId,
    axis: 'y',
    disabled: testing,
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiRequest('/admin/ai-settings');
      const nextModels = normalizeModels(Array.isArray(response?.data?.models) ? response.data.models : []);
      setModels(editableModels(nextModels));
      setSavedModels(nextModels);
      failedAutoSavePayloadRef.current = '';
      setTestResults({});
    } catch (error) {
      setLoadError(error.message || '读取 AI 模型配置失败');
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const validationErrors = useMemo(() => {
    const errors = {};
    const seen = new Map();
    models.forEach((item, index) => {
      const modelId = item.model.trim();
      const modelName = item.model_name.trim();
      if (!modelName) errors[`${index}:model_name`] = '请输入用户看到的模型名称';
      if (!modelId) errors[`${index}:model`] = '请输入调用接口时使用的模型标识';
      if (modelName.length > 80) errors[`${index}:model_name`] = '显示名称不能超过 80 个字符';
      if (modelId.length > 200) errors[`${index}:model`] = '模型标识不能超过 200 个字符';
      if (modelId) {
        const key = modelId.toLocaleLowerCase();
        if (seen.has(key)) {
          errors[`${index}:model`] = `与第 ${seen.get(key) + 1} 项重复`;
        } else {
          seen.set(key, index);
        }
      }
    });
    return errors;
  }, [models]);

  const currentNormalized = useMemo(() => normalizeModels(models), [models]);
  const currentPayloadKey = JSON.stringify(currentNormalized);
  const hasChanges = currentPayloadKey !== JSON.stringify(savedModels);
  const isValid = Object.keys(validationErrors).length === 0 && currentNormalized.length > 0;
  const thinkingCount = models.filter((item) => item.supports_thinking).length;
  const enabledCount = models.filter((item) => item.enabled).length;
  const defaultModelIndex = models.findIndex((item) => item.enabled);

  useEffect(() => {
    if (
      loading
      || !hasChanges
      || !isValid
      || saving
      || testing
      || draggedModelId !== null
      || failedAutoSavePayloadRef.current === currentPayloadKey
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const requestId = autoSaveRequestIdRef.current + 1;
      autoSaveRequestIdRef.current = requestId;
      setSaving(true);
      setSaveStatus({ type: '', message: '' });
      try {
        const response = await apiRequest('/admin/ai-settings', {
          method: 'PUT',
          body: JSON.stringify({ models: currentNormalized }),
        });
        if (requestId !== autoSaveRequestIdRef.current) return;
        const persisted = normalizeModels(
          Array.isArray(response?.data?.models) ? response.data.models : currentNormalized
        );
        failedAutoSavePayloadRef.current = '';
        setSavedModels(persisted);
        setSaveStatus({ type: 'success', message: response?.message || '所有修改已自动保存' });
      } catch (error) {
        if (requestId !== autoSaveRequestIdRef.current) return;
        failedAutoSavePayloadRef.current = currentPayloadKey;
        setSaveStatus({ type: 'error', message: error.message || '自动保存 AI 模型配置失败' });
      } finally {
        if (requestId === autoSaveRequestIdRef.current) setSaving(false);
      }
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [
    apiRequest,
    currentNormalized,
    currentPayloadKey,
    draggedModelId,
    hasChanges,
    isValid,
    loading,
    saving,
    testing,
  ]);

  const updateModel = (index, field, value) => {
    failedAutoSavePayloadRef.current = '';
    setSaveStatus({ type: '', message: '' });
    setTestResults({});
    setModels((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const addModel = () => {
    failedAutoSavePayloadRef.current = '';
    setSaveStatus({ type: '', message: '' });
    setTestResults({});
    setModels((current) => [...current, createEmptyModel()]);
  };

  const removeModel = (index) => {
    failedAutoSavePayloadRef.current = '';
    setSaveStatus({ type: '', message: '' });
    setTestResults({});
    setModels((current) => editableModels(current.filter((_, itemIndex) => itemIndex !== index)));
  };

  const testAllModels = async () => {
    if (!isValid || testing || saving) return;
    setTesting(true);
    setTestResults({});
    try {
      const response = await apiRequest('/admin/ai-settings/test', {
        method: 'POST',
        body: JSON.stringify({ models: currentNormalized }),
      });
      const results = Array.isArray(response?.data?.results) ? response.data.results : [];
      const resultMap = Object.fromEntries(results.map((result) => [result.model, result]));
      setTestResults(Object.fromEntries(currentNormalized.map((item) => [
        item.model,
        resultMap[item.model] || {
          model: item.model,
          available: false,
          status_code: null,
          error: '检测服务未返回该模型的检测结果',
        },
      ])));
    } catch (error) {
      const message = error.message || '模型可用性检测失败';
      setTestResults(Object.fromEntries(currentNormalized.map((item) => [
        item.model,
        {
          model: item.model,
          available: false,
          status_code: null,
          error: message,
        },
      ])));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-5">
          <div className="h-7 w-48 rounded bg-slate-200" />
          <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
          <div className="h-44 rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <p className="font-medium text-rose-700">{loadError}</p>
        <button
          type="button"
          onClick={loadSettings}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <RefreshCw size={16} />
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <BrainCircuit size={21} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">AI 模型配置</h2>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
              <div className="flex flex-wrap gap-2 text-xs font-medium sm:justify-end">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">{models.length} 个模型</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{enabledCount} 个已启用</span>
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-700">{thinkingCount} 个支持思考</span>
              </div>
              <button
                type="button"
                onClick={testAllModels}
                disabled={!isValid || testing || saving}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {testing ? <RefreshCw size={16} className="animate-spin" /> : <PlugZap size={16} />}
                {testing ? `正在检测 ${models.length} 个模型` : '检测全部模型'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-7">
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[1030px]">
              <div className="grid grid-cols-[28px_34px_36px_minmax(155px,0.7fr)_minmax(240px,1.1fr)_220px_180px_36px] items-end gap-3 border-b border-slate-200 px-3 pb-3">
                <span aria-hidden="true" />
                <span className="pb-0.5 text-center text-xs font-medium text-slate-500">启用</span>
                <span className="pb-0.5 text-center text-xs font-medium text-slate-500">序号</span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">显示名称</span>
                  <span className="mt-0.5 block text-xs text-slate-400">用户在模型选择器中看到的名称</span>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">模型标识</span>
                  <span className="mt-0.5 block text-xs text-slate-400">必须与 AI 服务商提供的模型 ID 完全一致</span>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">检测结果</span>
                  <span className="mt-0.5 block text-xs text-slate-400">可用显示勾，不可用显示具体错误</span>
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-700">思考能力</span>
                  <span className="mt-0.5 block text-xs text-slate-400">控制思考过程展示与请求参数</span>
                </span>
                <span aria-hidden="true" />
              </div>

              <div {...modelReorderContainerProps} className="space-y-2 pt-3">
                {models.map((item, index) => {
                  const nameError = validationErrors[`${index}:model_name`];
                  const modelError = validationErrors[`${index}:model`];
                  const testResult = testResults[item.model.trim()];
                  const isDefaultModel = index === defaultModelIndex;

                  return (
                    <div
                      key={item._clientId}
                      {...getModelReorderItemProps(item)}
                      className={`grid grid-cols-[28px_34px_36px_minmax(155px,0.7fr)_minmax(240px,1.1fr)_220px_180px_36px] items-center gap-3 rounded-xl border px-3 py-3 transition ${
                        item.enabled ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50/80'
                      } ${draggedModelId === item._clientId ? 'border-violet-300 opacity-70 ring-2 ring-violet-100' : ''}`}
                    >
                      <button
                        type="button"
                        {...getModelReorderHandleProps(item)}
                        title="拖拽调整模型顺序"
                        aria-label={`拖拽第 ${index + 1} 个模型调整顺序`}
                        className="flex h-8 w-7 cursor-grab touch-none select-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                      >
                        <GripVertical size={17} className="pointer-events-none" />
                      </button>

                      <label className="flex items-center justify-center" title={item.enabled ? '已启用' : '已停用'}>
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(event) => updateModel(index, 'enabled', event.target.checked)}
                          disabled={testing}
                          aria-label={`${item.model_name || `第 ${index + 1} 个模型`}启用状态`}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </label>

                      <span
                        title={isDefaultModel ? '默认模型' : `第 ${index + 1} 个模型`}
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                          isDefaultModel
                            ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {index + 1}
                      </span>

                      <div className="min-w-0">
                        <input
                          value={item.model_name}
                          onChange={(event) => updateModel(index, 'model_name', event.target.value)}
                          maxLength={80}
                          disabled={testing}
                          aria-label={`第 ${index + 1} 个模型的显示名称`}
                          placeholder="例如：GPT-4.1 Mini"
                          className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                            nameError
                              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                              : 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
                          }`}
                        />
                        {nameError && <span className="mt-1 block text-xs text-rose-600">{nameError}</span>}
                      </div>

                      <div className="min-w-0">
                        <div className="relative">
                          <input
                            value={item.model}
                            onChange={(event) => updateModel(index, 'model', event.target.value)}
                            maxLength={200}
                            disabled={testing}
                            spellCheck={false}
                            aria-label={`第 ${index + 1} 个模型的模型标识`}
                            placeholder="例如：openai/gpt-4.1-mini"
                            className={`h-10 w-full rounded-lg border bg-white px-3 font-mono text-sm text-slate-900 outline-none transition focus:ring-2 ${
                              modelError
                                ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                                : 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
                            }`}
                          />
                        </div>
                        {modelError && <span className="mt-1 block text-xs text-rose-600">{modelError}</span>}
                      </div>

                      <div
                        aria-live="polite"
                        title={testResult && !testResult.available
                          ? `${testResult.status_code ? `HTTP ${testResult.status_code}` : '无状态码'} · ${testResult.error || 'AI 服务未返回错误详情'}`
                          : undefined}
                        className={`flex h-12 min-w-0 items-center rounded-lg border px-3 text-xs ${
                          testResult?.available
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : testResult
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                      >
                        {testResult?.available ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <Check size={14} strokeWidth={3} />
                            可用
                          </span>
                        ) : testResult ? (
                          <span className="line-clamp-2 break-all font-medium leading-4">
                            {testResult.status_code ? `HTTP ${testResult.status_code}` : '无状态码'} · {testResult.error || 'AI 服务未返回错误详情'}
                          </span>
                        ) : (
                          <span>{testing ? '检测中…' : '尚未检测'}</span>
                        )}
                      </div>

                      <div className="flex min-w-0 items-center gap-2">
                        <IOSToggle
                          enabled={item.supports_thinking}
                          onChange={(enabled) => updateModel(index, 'supports_thinking', enabled)}
                          disabled={testing}
                          size="sm"
                          label={`${item.model_name || `第 ${index + 1} 个模型`}思考能力`}
                        />
                        <span className={`truncate text-xs font-medium ${item.supports_thinking ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {item.supports_thinking ? '支持思考' : '普通模型'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeModel(index)}
                        disabled={testing}
                        aria-label={`删除第 ${index + 1} 个模型`}
                        title="删除模型"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={addModel}
            disabled={models.length >= 50 || testing}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={17} />
            添加模型
          </button>

          {enabledCount === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              当前没有已启用模型。修改会自动保存，但用户、代理和管理员的 AI 聊天将暂时不可用。
            </div>
          )}

        </div>

        <div className="flex min-h-[60px] items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-sm sm:px-7">
          {saving ? (
            <span className="inline-flex items-center gap-2 font-medium text-violet-700">
              <RefreshCw size={16} className="animate-spin" />
              正在自动保存
            </span>
          ) : saveStatus.message ? (
            <span className={`inline-flex items-center gap-1.5 font-medium ${saveStatus.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>
              {saveStatus.type === 'success' && <Check size={16} />}
              {saveStatus.message}
            </span>
          ) : hasChanges && !isValid ? (
            <span className="text-amber-700">请完善必填项，填写完整后将自动保存</span>
          ) : hasChanges ? (
            <span className="text-violet-700">修改将在片刻后自动保存</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Check size={16} />
              所有修改已自动保存
            </span>
          )}
          <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">无需手动保存</span>
        </div>
      </section>
    </div>
  );
}

export default AIModelSettingsPanel;
