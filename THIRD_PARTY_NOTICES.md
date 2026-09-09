# Third-party notices

The project MIT license does not relicense third-party photographs, logos, manufacturer marks or dependency code. No endorsement by Arduino, Raspberry Pi, Espressif, Wokwi, Adafruit, SparkFun or any university is implied.

## Product photographs

`research/image-sources.json` records image source URLs, attribution, exact/representative matching, processing and known reuse information. `lib/hardware/photos.ts` exposes attribution in the application. Local WebP assets were resized/converted; this does not establish new ownership.

Explicitly recorded CC BY-SA 4.0 images include Espressif's ESP32-DevKitC V4 documentation photograph, Raspberry Pi Ltd's Pico documentation photograph, and Laserlicht's Bosch BME280 photograph from Wikimedia Commons. Their source and license links are in the image records and visible in the product lightbox. These adapted images remain under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

For other manufacturer/product photographs, an explicit open reuse license has **not been verified**. Their inclusion preserves the existing application assets and source attribution; it is not a grant of redistribution rights. A source-only public distribution can omit these assets and use the application's named fallbacks, or replace them with appropriately licensed images. Review the per-image record before redistributing a photograph independently or claiming the entire asset collection is MIT licensed.

## Dependencies and UI components

The pinned dependency versions are listed in `package.json` and `pnpm-lock.yaml`. Their licenses and copyright notices remain with the respective packages. The UI includes shadcn/Base UI components and Lucide icons. These are third-party building blocks, not independently invented components.

The breadboard screenshots in `docs/images/` show the application's rendered circuit geometry; they are not manufacturer product photographs.

## AVR8js and Arduino CAD additions

The in-browser AVR runtime uses AVR8js 0.21.0 (MIT), copyright Uri Shaked
and contributors: https://github.com/wokwi/avr8js. Sketch compilation is an
external request to the compiler used by the official AVR8js demo, made only
when Run sketch is pressed; no compiler credentials are bundled.

Arduino UNO/Mega Rev3e planar CAD derivatives have a separate **CC BY-SA 4.0**
license. See `public/models/arduino-cad-NOTICE.md` for original source downloads,
license, changes and limitations. These data are not relicensed under MIT.
