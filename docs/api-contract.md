# REST API 契约

状态：实验、化合物、标签和显式关联路径已于阶段 03 实现；其余业务路径按后续阶段实现。所有路径以 /api 开头。字段类型和关系约束以 [数据模型](data-model.md) 为准；此处固定外部行为。阶段 01 建立 OpenAPI 和类型生成机制，后续阶段逐步实现业务路由，不提前创建返回假数据的占位业务接口。

## 通用协议

- UTF-8 JSON；时间戳输出 ISO 8601 UTC，date 输出 YYYY-MM-DD；UUID 输出字符串；Decimal 输出字符串，文件字节数输出整数。
- POST 成功 201，GET/PATCH/restore 成功 200，DELETE 和解除关联成功 204。未知/不可见对象 404，引用或版本冲突 409，字段错误 422，超限上传 413，不支持内容类型 415，存储暂不可用 503。
- 列表响应 `{items: [], page: 1, page_size: 25, total: 0}`；page >= 1，page_size 1..100。
- 默认实验排序 `date_desc`（date DESC, id DESC），化合物/样品 `created_desc`（created_at DESC, id DESC），文件 `uploaded_desc`。只允许文档列出的排序枚举，未知值 422。
- 普通 GET 不暴露 deleted_at 非空或父级无效的对象。回收站是专用接口，不靠任意 include_deleted 参数绕过。
- 可更新实体响应带 version。PATCH JSON 必须含 expected_version；DELETE 使用 expected_version 查询参数；restore 使用 `{expected_version: n}`。错误版本为 409，不自动覆盖或重试写入。
- 显式关联和标签关联改变时锁定并递增其 Experiment/Compound 版本；创建/更新子实体不递增父 version，摘要另用内容哈希标识整体快照。
- JSON 禁止未知写入字段。PATCH 未出现字段保持不变，显式 null 只用于可空字段。错误响应不得泄露磁盘绝对路径、SQL 或凭证。

错误示例：

```json
{"error":{"code":"VERSION_CONFLICT","message":"记录已被修改，请刷新后重试","fields":[],"request_id":"req-123"}}
```

fields 元素格式为 `{field: "amount", message: "请同时填写单位"}`。request_id 在响应头 X-Request-ID 和日志中一致。统一映射 FastAPI 参数校验错误，不保留第二套错误格式。

## 实验与化合物

| 方法和路径 | 输入与返回 |
|---|---|
| GET /experiments | q、status、date_from、date_to、tag_id、page/page_size、sort=date_desc/date_asc；q 搜 title/code |
| POST /experiments | title、date 必填；其余业务字段可选；tag_ids 可选且默认 []；返回完整记录 |
| GET /experiments/{id} | 完整基本字段和标签；子实体通过各列表获取，不返回无限嵌套集合 |
| PATCH /experiments/{id} | expected_version 和可修改字段；tag_ids 出现时原子替换标签集合 |
| DELETE /experiments/{id} | expected_version；软删除 |
| POST /experiments/{id}/restore | expected_version；恢复 |
| GET /experiments/{id}/compounds | 分页并集，返回 compound 及 sources 数组 |
| POST /experiments/{id}/compounds | compound_id、expected_version（实验版本）；新增显式关联，重复关联 409 |
| DELETE /experiments/{id}/compounds/{compound_id} | expected_version（实验版本）；仅解除显式关联；不存在显式关联返回 404 |
| GET /compounds | q、tag_id、page/page_size、sort=created_desc/name_asc；q 搜 name/code/smiles |
| POST /compounds | name 必填；smiles、molecular_formula、molecular_weight、notes、tag_ids 可选 |
| GET/PATCH/DELETE /compounds/{id} | 详情、更新、软删除；更新与删除采用版本规则 |
| POST /compounds/{id}/restore | 恢复 |
| GET /compounds/{id}/experiments | 分页反查，含 sources |
| GET /compounds/{id}/reactions | 分页反查，有效反应去重 |
| GET /compounds/{id}/samples | 分页反查有效样品 |

创建实验示例：

```json
{"title":"Suzuki 条件探索","date":"2026-09-22","objective":"比较反应条件","status":"draft","tag_ids":[]}
```

响应具有服务器生成的 id、experiment_code、created_at、updated_at、version=1 和全部定义字段。后端不接受客户端传入编号。返回标签为 `{id,name,version}` 数组，不再单独返回 tag_ids。

## 样品与反应

| 方法和路径 | 行为 |
|---|---|
| GET /samples | experiment_id、compound_id、q（name/code）、page/page_size |
| POST /samples | experiment_id、sample_type 必填；其他字段见数据模型 |
| GET/PATCH/DELETE /samples/{id} | 详情、更新、软删除；experiment_id 不可修改 |
| POST /samples/{id}/restore | 恢复 |
| GET /experiments/{id}/reactions | 分页查询反应 |
| POST /experiments/{id}/reactions | reaction_name 必填；条件字段可选 |
| GET/PATCH/DELETE /reactions/{id} | 详情、更新、软删除 |
| POST /reactions/{id}/restore | 恢复 |
| GET /reactions/{id}/components | 按 sort_order、created_at、id 排序，分页 |
| POST /reactions/{id}/components | compound_id、role 必填；数量等可选 |
| PATCH/DELETE /reactions/{id}/components/{component_id} | 校验组件属于路径中的 reaction；版本控制 |
| POST /reactions/{id}/components/{component_id}/restore | 校验父级有效后恢复 |

组分创建示例：`{"compound_id":"<UUID>","role":"product","mmol":"0.72000000","yield_percent":"72.00000000"}`。示例占位 UUID 不可当作有效测试数据直接发送。

## 文件与标签

| 方法和路径 | 行为 |
|---|---|
| GET /experiments/{id}/files | 分页附件列表 |
| POST /experiments/{id}/files | multipart/form-data；单个 file 必填，sample_id、instrument_type、notes 可选；成功 201 |
| GET /files | experiment_id、sample_id、file_type、q（原文件名）、page/page_size |
| GET /files/{id} | 元数据；不返回 file_path/内部 filename，返回 download_url |
| PATCH /files/{id} | expected_version，sample_id/instrument_type/notes；二进制不可变 |
| GET /files/{id}/download | 流式附件响应；Content-Disposition 安全编码原名；nosniff |
| DELETE /files/{id} | 软删除，保留物理文件 |
| POST /files/{id}/restore | 恢复 |
| GET/POST /tags | 分页 q 查询；创建 name |
| PATCH /tags/{id} | name 与 expected_version；规范化名称重复返回 409 |
| DELETE /tags/{id} | expected_version；清除标签及关联，不删除业务数据 |

上传不支持覆盖、断点续传和 ZIP 解压。客户端可依次发送多个单文件请求，逐文件显示结果；失败后不能自动重发可能已成功的上传而不提示用户。

## 搜索、摘要与回收站

- GET /search：q 必填，去首尾空白，1..200 字符；experiment_page、compound_page 默认 1，page_size 默认 25。返回 `{query,experiments:{items,page,page_size,total},compounds:{items,page,page_size,total}}`。每项含 matched_fields。各组稳定按 created_at DESC,id DESC 排序。
- GET /dashboard：返回 experiment_count、compound_count、sample_count、recent_experiments、recent_files；最近集合固定最多 5 条；遵循有效记录规则。
- GET /experiments/{id}/summary?format=json|markdown：默认 json，包含实验字段、反应和组分、样品、文件清单、generated_at、source_revision。source_revision 是规范化有序内容的 SHA256，不包含 generated_at；在一致性数据库快照中读取全部数据。markdown 响应 text/markdown，可下载 UTF-8 文本；空字段为“未记录”，不含被删除内容。
- GET /trash：type=experiment|compound|sample|reaction|component|file，默认 experiment，分页。只返回自身 deleted_at 非空的记录；被父级隐藏但未单独删除的子记录不重复列入回收站。返回父级是否有效及恢复阻塞原因。恢复走各实体 restore 路由。
- GET /health/live：进程存活 200；GET /health/ready：数据库和存储根目录可读写时 200，否则 503；不返回敏感配置。

## 客户端兼容与验收

所有新增接口纳入 OpenAPI，前端生成类型不手写复制；生成文件与当前 OpenAPI 一致。失败测试覆盖 404/409/413/415/422；错误必须展示为可读提示。关联查询、全局搜索的稳定排序和分页由数据库完成，不把全部数据拉到浏览器再过滤。
