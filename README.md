# Setup vcpkg

![Linter](https://github.com/RealChuan/setup-vcpkg/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/RealChuan/setup-vcpkg/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/RealChuan/setup-vcpkg/actions/workflows/check-dist.yml/badge.svg)
![Coverage](./badges/coverage.svg)

在 GitHub Actions 上安装
[vcpkg](https://github.com/microsoft/vcpkg)。支持 Windows、Linux 和 macOS 运行器，**只安装 vcpkg 本身，不安装任何库（ports）**。

## 安装位置

| 平台    | 默认目录                 | 可执行文件                     |
| ------- | ------------------------ | ------------------------------ |
| Windows | `C:\vcpkg`               | `C:\vcpkg\vcpkg.exe`           |
| Linux   | `/usr/local/share/vcpkg` | `/usr/local/share/vcpkg/vcpkg` |
| macOS   | `/usr/local/share/vcpkg` | `/usr/local/share/vcpkg/vcpkg` |

安装完成后，Action 会：

- 把安装目录加入后续步骤的 `PATH`
- 导出 `VCPKG_ROOT` 和 `VCPKG_INSTALLATION_ROOT` 环境变量
- 输出 `vcpkg-root` 和 `vcpkg-version`

## 快速开始

```yaml
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v7

      - name: Setup vcpkg
        uses: RealChuan/setup-vcpkg@main

      - name: Show the installed version
        run: vcpkg version
```

## 输入参数

| 参数            | 说明                                 | 必需 | 默认值                               |
| --------------- | ------------------------------------ | ---- | ------------------------------------ |
| `repository`    | 从哪里克隆 vcpkg                     | 否   | `https://github.com/microsoft/vcpkg` |
| `ref`           | 分支、标签或提交                     | 否   | `master`                             |
| `install-dir`   | 安装目录，留空则使用上表中的默认目录 | 否   | `''`                                 |
| `clean`         | 安装前删除已存在的目录               | 否   | `true`                               |
| `run-integrate` | 是否执行 `vcpkg integrate install`   | 否   | `true`                               |

## 输出参数

| 参数            | 说明              |
| --------------- | ----------------- |
| `vcpkg-root`    | vcpkg 的安装目录  |
| `vcpkg-version` | 安装的 vcpkg 版本 |

## 使用示例

### 配合 CMake 使用

```yaml
- name: Setup vcpkg
  uses: RealChuan/setup-vcpkg@main

- name: Configure
  shell: bash
  run:
    cmake -B build -S .
    -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
```

### 固定 vcpkg 版本

`ref` 可以是分支、标签，也可以是提交哈希（此时会回退为完整克隆再 checkout）：

```yaml
- name: Setup vcpkg
  uses: RealChuan/setup-vcpkg@main
  with:
    ref: 2024.09.30
```

### 使用自己的 vcpkg 仓库

```yaml
- name: Setup vcpkg
  uses: RealChuan/setup-vcpkg@main
  with:
    repository: https://github.com/your-org/vcpkg
    ref: my-branch
```

私有仓库可以通过 URL 里带 token 的方式克隆，例如
`https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/your-org/vcpkg`。

### 安装到自定义目录

```yaml
- name: Setup vcpkg
  uses: RealChuan/setup-vcpkg@main
  with:
    install-dir: ${{ runner.temp }}/vcpkg
```

### 不做全局集成

`vcpkg integrate install`
会写入当前用户的集成配置（`~/.vcpkg`），如果只想拿到一个可用的 vcpkg，可以关闭它：

```yaml
- name: Setup vcpkg
  uses: RealChuan/setup-vcpkg@main
  with:
    run-integrate: false
```

### 配合缓存（可选）

vcpkg 的二进制缓存默认写在 `~/.cache/vcpkg/archives`（Windows 为
`%LOCALAPPDATA%\vcpkg\archives`），可以自行缓存该目录；本 Action 不负责缓存。

## 说明

- **权限**：Linux 运行器上 `/usr/local/share` 属于 root，Action 会在必要时用免密
  `sudo`
  创建目录并交还给当前用户，后续的 clone、bootstrap、integrate 都以运行器用户身份执行，因此
  `vcpkg integrate install` 写入的是正确的家目录。
- **PowerShell**：Windows 上通过 PowerShell 执行 `bootstrap-vcpkg.bat`，优先使用
  `pwsh`，没有时回退到 `powershell`。
- **不会安装任何库**：安装完成后需要自己执行
  `vcpkg install <port>`，或者使用 manifest 模式（`vcpkg.json`）。需要 `vcpkg`
  的 CMake 工具链文件时可以用 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`。
- **重复执行**：默认 `clean: true`，会先删除已有目录；设为 `false`
  时会复用已有目录，只重新执行 bootstrap 和 integrate。

## 开发

```bash
npm install        # 安装依赖
npm run all        # 格式化、lint、测试、更新覆盖率徽章、打包 dist/
```

修改 `src/` 后必须重新打包并提交 `dist/index.js`，否则 Action 运行的还是旧代码。

## 许可

[MIT](./LICENSE)
