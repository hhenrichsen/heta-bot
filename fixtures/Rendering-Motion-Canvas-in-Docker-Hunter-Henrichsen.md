---
title: "Rendering Motion Canvas in Docker | Hunter Henrichsen"
source: "https://henrichsen.dev/guide/motion-canvas-render-docker"
archived: "2025-09-18T08:18:25.950Z"
site: "Rendering Motion Canvas in Docker"
---

[< guide](/guide)

# Rendering Motion Canvas in Docker

bud ⋄ posted about 1 year ago ⋄ 5 min read

I’ve been working on a more involved animation project with Motion Canvas lately, and have wondered if I’d be able to speed up the rendering process by using a bunch of Docker containers. Here’s what I’ve found.

## The Puppeteer Part [#](#the-puppeteer-part)

To start, I need a way to render my project automatically. I used puppeteer for this. I start by creating an app to test against, and a test file. These use the existing motion canvas vite server. I’ll need to grab packages first:


```bash
npm install puppeteer vitest --save-dev
```


Then create the app itself:


```ts
import * as path from "path";
import puppeteer, { Page } from "puppeteer";
import { fileURLToPath } from "url";
import { createServer } from "vite";


const Root = fileURLToPath(new URL(".", import.meta.url));


export interface App {
  page: Page;
  stop: () => Promise<void>;
}


export async function start(): Promise<App> {
  const [browser, server] = await Promise.all([
    puppeteer.launch({
      headless: true,
      protocolTimeout: 15 * 60 * 1000,
      args: ["--no-sandbox"],
    }),
    createServer({
      root: path.resolve(Root, "../../"),
      configFile: path.resolve(Root, "../../vite.config.ts"),
      server: {
        port: 9000,
      },
    }),
  ]);


  const portPromise = new Promise<number>((resolve) => {
    server.httpServer.once("listening", async () => {
      const port = (server.httpServer.address() as any).port;
      resolve(port);
    });
  });
  await server.listen();
  const port = await portPromise;
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}`, {
    waitUntil: "networkidle2",
  });


  return {
    page,
    async stop() {
      await Promise.all([browser.close(), server.close()]);
    },
  };
}
```


And the actual “test”:


```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { App, start } from "./app";


describe("Rendering", () => {
  let app: App;


  beforeAll(async () => {
    app = await start();
  }, 30 * 1000);


  afterAll(async () => {
    await app.stop();
  }, 30 * 1000);


  test(
    "Animation renders correctly",
    {
      timeout: 15 * 60 * 1000,
    },
    async () => {
      await app.page.evaluateHandle("document.fonts.ready");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      await app.page.screenshot();
      const rendering = await app.page.waitForSelector(
        "::-p-xpath(//div[contains(text(), 'Video Settings')])"
      );
      if (rendering) {
        const tab = await app.page.evaluateHandle(
          (el) => el.parentElement,
          rendering
        );
        await tab.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));


      await app.page.select(
        "::-p-xpath(//div[contains(text(), 'Rendering')]/parent::div//label[contains(text(), 'exporter')]/parent::div//select)",
        "Image sequence"
      );


      const render = await app.page.waitForSelector("#render");
      await render.click();
      await app.page.waitForSelector('#render[data-rendering="true"]', {
        timeout: 2 * 1000,
      });
      await app.page.waitForSelector('#render:not([data-rendering="true"])', {
        timeout: 15 * 60 * 1000,
      });


      expect(true).toBe(true);
    }
  );
});
```


I’ll also save the script in my package.json


```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```


If your animation is simple, giving this a test run with


```bash
npm run test
```


should give you a good idea what happens. It now will render the animation as an image sequence to your output folder, just by running the command. You may need to adjust timeouts depending on the amount of work you’re doing.

## The Docker Part [#](#the-docker-part)

I started with a simple dockerfile. I’m using `alpine-chrome` so that WebGL works properly, since I’m personally using shaders.


```dockerfile
FROM zenika/alpine-chrome:with-node


USER root
WORKDIR /app
COPY package*.json ./
RUN npm install


COPY vite.config.ts ./
COPY public ./public
COPY src ./src


CMD npm run test
```


I can then run it by building the image and running it:

**Linux**


```bash
docker build -t my-animation-renderer .
docker run --rm -v $(pwd)/container-output:/app/output my-animation-renderer
```


**Windows (Powershell)**


```bash
docker build -t my-animation-renderer .
docker run --rm -v ${PWD}/container-output:/app/output my-animation-renderer
```


**Windows (CMD)**


```bash
docker build -t my-animation-renderer .
docker run --rm -v %cd%/container-output:/app/output my-animation-renderer
```


This one *works*, but isn’t very good because each time you run it, it will render the full animation. My real goal with this was to render the animation in pieces simultaneously.

So I’ll update it to take in an environment variable to set the start and end seconds. I’ll then overwrite the project meta file with the new range inside of the container without affecting the host.


```dockerfile
FROM zenika/alpine-chrome:with-node


USER root
RUN apk update \
    && apk add --no-cache jq \
    && rm -rf /var/cache/apk/*


WORKDIR /app
COPY package*.json ./
RUN npm install


COPY vite.config.ts ./
COPY public ./public
COPY src ./src
ENV START=0
ENV END=5


CMD tmp=$(mktemp) \
    && jq --arg start "$START" --arg end "$END" '.shared.range[0] = ($start|tonumber) | .shared.range[1] = ($end|tonumber)' src/project.meta > $tmp \
    && mv $tmp src/project.meta \
    && npm run test -- run
```


I can then run it with the following, which will render the first 5 seconds of the animation.

**Linux**


```bash
docker build -t my-animation-renderer .
docker run --rm -v $(pwd)/container-output:/app/output -e START=0 -e END=5 my-animation-renderer
```


**Windows (Powershell)**


```bash
docker build -t my-animation-renderer .
docker run --rm -v ${PWD}/container-output:/app/output -e START=0 -e END=5 my-animation-renderer
```


**Windows (CMD)**


```bash
docker build -t my-animation-renderer .
docker run --rm -v %cd%/container-output:/app/output -e START=0 -e END=5 my-animation-renderer
```


## The Real Fun Part (Docker Compose) [#](#the-real-fun-part-docker-compose)

I can then use docker-compose to run multiple containers at once. I’ll create a `devops/docker-compose.yml` file that looks like this:


```yaml
services:
  render: &render
    build:
      context: ..
      dockerfile: Dockerfile
    container_name: render-1
    environment:
      - START=0
      - END=10
    volumes:
      - ../container-output:/app/output
  render2:
    <<: *render
    container_name: render-2
    environment:
      - START=10
      - END=20
  render3:
    <<: *render
    container_name: render-3
    environment:
      - START=20
      - END=30
  render4:
    <<: *render
    container_name: render-4
    environment:
      - START=30
      - END=40
  render5:
    <<: *render
    container_name: render-5
    environment:
      - START=40
      - END=50
  render6:
    <<: *render
    container_name: render-6
    environment:
      - START=50
      - END=60
  render7:
    <<: *render
    container_name: render-7
    environment:
      - START=60
      - END=70
  render8:
    <<: *render
    container_name: render-8
    environment:
      - START=70
      - END=80
  render9:
    <<: *render
    container_name: render-9
    environment:
      - START=80
      - END=90
  render10:
    <<: *render
    container_name: render-10
    environment:
      - START=90
      - END=100
```


You can make as many of these as your computer can handle. Then run it from the root folder with:


```bash
docker-compose -f devops/docker-compose.yml up --build
```


If this is actually efficient at all probably depends on your setup. I can see myself publishing an image to a private container repository and running it on local compute resources, or hooking it up to a fleet of cloud machines to render animations in parallel. So your mileage may vary.

As always, if you have questions or comments, feel free to reach out to me on Discord, either on [my personal server](https://discord.gg/hHxXWy7FRQ) or the [Motion Canvas server](https://chat.motioncanvas.io/).