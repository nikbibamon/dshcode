# Publishing the prepared extension

The installed package is tvijo.tvijo-dshrem 0.4.3. Download the exact VSIX and checksums from https://dsh.tvijo.com/download. To publish this same package, use an account authorized for the `tvijo` Marketplace publisher. Configure its VSCE_PAT in your own secure environment (never in chat, settings.json or GitHub source), then run:

```sh
npx @vscode/vsce publish --packagePath tvijo-dshrem-0.4.3.vsix
```

The build host currently has no stored publisher credential. Local installation and website downloads work independently of Marketplace publishing. Keep `UNLICENSED` until the operator makes a licensing decision.
