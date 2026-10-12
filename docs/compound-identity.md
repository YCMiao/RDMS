# 化合物身份规范与资料核验（2026-10-01）

## 字段约定

- 编号采用 `cas_number`，不再分配 CMP 编号。未查到可核实 CAS 时显示“CAS 待确认”，不拿代号、PubChem CID 或其他标识冒充 CAS。
- `name` 存系统名称；`codename` 存原有名称或实验简称。列表、详情、搜索、投料与总览均按此含义展示。
- Alembic `b7e1a9302c64` 将原 `name` 保留为 `codename`，原 `iupac_name` 改为 `name`；旧 CMP 值只在内部归档列保留，不再通过 API 或界面提供，也不再分配。UUID 及实验、反应、样品关联不变。
- CAS 保持原有可空、非唯一字段语义，不合并记录。新建或修改时校验 CAS 格式和校验位；不同结构替换会清除旧名称与身份资料。实验与样品编号规则不变。

## 2026-10-01 七条记录的历史联网核验

以下记录是当时的资料维护证据，不代表当前数据库数量或接口可用性。本次工程审计未重新联网查询或修改科研资料。

5 条名称来自 PubChem 精确 InChIKey 匹配；2 条由保存结构推导系统名称，再经 EMBL-EBI OPSIN 反向解析，比对完整标准 InChIKey 一致。这两条不声称是注册机构的首选名称。四个已录入 CAS 均与对应精确 CID 的同义词相符；盐酸盐身份保持。

| 代号 | CAS 编号 | 系统名称 | 名称依据 |
|---|---|---|---|
| Ester-6-HF | 未查到可核实 CAS | tert-butyl 2-((4-oxo-2-phenyl-4H-chromen-6-yl)oxy)acetate | 结构命名 + OPSIN 验证 |
| Boc-NH-4C-FP | 2093388-52-2 | tert-butyl N-[4-[[2-(2,6-dioxopiperidin-3-yl)-1,3-dioxoisoindol-4-yl]amino]butyl]carbamate | PubChem |
| 6HF | 6665-83-4 | 6-hydroxy-2-phenylchromen-4-one | PubChem |
| 6HF-4C-FP | 未查到可核实 CAS | N-(4-((2-(2,6-dioxopiperidin-3-yl)-1,3-dioxoisoindolin-4-yl)amino)butyl)-2-((4-oxo-2-phenyl-4H-chromen-6-yl)oxy)acetamide | 结构命名 + OPSIN 验证 |
| Acid-6-HF | 未查到可核实 CAS | 2-(4-oxo-2-phenylchromen-6-yl)oxyacetic acid | PubChem |
| NH₂-4C-FP | 2162120-73-0 | 4-(4-aminobutylamino)-2-(2,6-dioxopiperidin-3-yl)isoindole-1,3-dione;hydrochloride | PubChem |
| 4-FP | 835616-60-9 | 2-(2,6-dioxopiperidin-3-yl)-4-fluoroisoindole-1,3-dione | PubChem |

使用本机当前配置额外请求 CAS Common Chemistry 时，三条查询均返回密钥被拒绝（认证或权限问题）。未改动密钥；这条官方检索路径在该次核验时不可用。

三个 CAS 缺项分别是 Ester-6-HF、Acid-6-HF、6HF-4C-FP。检索覆盖 PubChem、NIH/NCI Cactus，以及精确结构键、系统名称、代号与相关文献；未找到并不证明未分配 CAS。Acid-6-HF 已有 PubChem CID 1695613，原始论文 CD-9 也记载其名称与分子式，但这些来源未给出 CAS。

## 可复核来源

### Ester-6-HF

结构键：`JXAWHDDXMJLMSB-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/JXAWHDDXMJLMSB-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 2](https://www.ebi.ac.uk/opsin/ws/tert-butyl%202-%28%284-oxo-2-phenyl-4H-chromen-6-yl%29oxy%29acetate.json)
- [来源 3](https://cactus.nci.nih.gov/chemical/structure/CC%28C%29%28C%29OC%28%3DO%29COc1ccc2oc%28-c3ccccc3%29cc%28%3DO%29c2c1/cas)

### Boc-NH-4C-FP

结构键：`OYPNLZMEXLFKLB-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/compound/138694407)
- [来源 2](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/OYPNLZMEXLFKLB-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 3](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/138694407/synonyms/JSON)

### 6HF

结构键：`GPZYYYGYCRFPBU-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/compound/72279)
- [来源 2](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/GPZYYYGYCRFPBU-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 3](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/72279/synonyms/JSON)

### 6HF-4C-FP

结构键：`YFWVBOIHHQJLOH-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/YFWVBOIHHQJLOH-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 2](https://www.ebi.ac.uk/opsin/ws/N-%284-%28%282-%282%2C6-dioxopiperidin-3-yl%29-1%2C3-dioxoisoindolin-4-yl%29amino%29butyl%29-2-%28%284-oxo-2-phenyl-4H-chromen-6-yl%29oxy%29acetamide.json)
- [来源 3](https://cactus.nci.nih.gov/chemical/structure/O%3DC%28COc1ccc2oc%28-c3ccccc3%29cc%28%3DO%29c2c1%29NCCCCNc1cccc2c1C%28%3DO%29N%28C1CCC%28%3DO%29NC1%3DO%29C2%3DO/cas)

### Acid-6-HF

结构键：`KQEOGPCXQWMSKA-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/compound/1695613)
- [来源 2](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/KQEOGPCXQWMSKA-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 3](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1695613/synonyms/JSON)
- [来源 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC10731637/)
- [来源 5](https://cactus.nci.nih.gov/chemical/structure/O%3DC%28O%29COc1ccc2oc%28-c3ccccc3%29cc%28%3DO%29c2c1/cas)

### NH₂-4C-FP

结构键：`RPZIYPJCEKKGPO-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/compound/139211244)
- [来源 2](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/RPZIYPJCEKKGPO-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 3](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/139211244/synonyms/JSON)

### 4-FP

结构键：`CRAUTELYXAAAPW-UHFFFAOYSA-N`

- [来源 1](https://pubchem.ncbi.nlm.nih.gov/compound/11859051)
- [来源 2](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/CRAUTELYXAAAPW-UHFFFAOYSA-N/property/IUPACName,MolecularFormula,MolecularWeight,InChIKey/JSON)
- [来源 3](https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/11859051/synonyms/JSON)

## 数据保护与限制

更新前备份：`backups/pre-compound-identity-20261001`。系统名称补全仅修改 `name`，CAS 号已经填写的四条保持原值。化学结构、分子式、分子量、备注、标签以及全部关联不在本次补全写入范围内。来源独立记在本文档，不覆盖原实验备注。

有新建化合物后不支持直接退回旧 CMP 编号方案；迁移降级会明确拒绝生成虚构旧编号。需要恢复时按 README 使用迁移前备份做隔离恢复。
