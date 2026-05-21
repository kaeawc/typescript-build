# File Processor Example

Shows how to keep file-oriented CLI logic testable by injecting `FileSystem`
and `ChecksumCalculator`, returning `Result`, and constraining paths with
`PathResolver`.

Run it from the repo root:

```bash
bun examples/file-processor/index.ts . package.json
```
