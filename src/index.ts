import * as fs from "fs";
import * as path from "path";
import * as axios from "axios";
import * as jszip from "jszip";
import * as simpleGit from "simple-git";
import { env } from "./env";

const api = axios.default.create({
  baseURL: "https://open-api.bser.io/",
  headers: {
    accept: "application/json",
    "accept-encoding": "*",
    "x-api-key": env.ER_API_KEY,
  },
  validateStatus: null,
});

(async function main() {
  try {
    const { repoPath, git } = await initGit();

    await syncGameData(repoPath, git);
    await syncL10nData(repoPath, git);
    await syncFreeCharactersData(repoPath, git);

    console.log(new Date(), "git.push", await git.push());
  } catch (err) {
    console.error(new Date(), err);
  }
})();

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function initGit() {
  const repoPath = path.resolve("./repo");
  await mkdirSafe(repoPath);

  const git = simpleGit.simpleGit(repoPath);
  // await git.init();
  console.log(new Date(), "git.fetch", await git.fetch());
  console.log(
    new Date(),
    "git.reset",
    await git.reset(["--hard", "origin/master"])
  );

  return {
    repoPath,
    git,
  };
}

async function syncGameData(repoPath: string, git: simpleGit.SimpleGit) {
  const checkpoint = await git
    .log({
      maxCount: 50,
    })
    .then((log) => log.all.find((v) => v.message.includes("gameDb/gamedata-")));
  if (checkpoint === void 0) {
    throw new Error("missing checkpoint");
  }

  const zipNames = await getZipNames();
  const checkpointIndex = zipNames.indexOf(checkpoint.message);
  // if (checkpointIndex === -1) {
  //   throw new Error("checkpoint not found");
  // }
  if (checkpointIndex >= 0) {
    zipNames.splice(0, checkpointIndex);
  }
  console.log(new Date(), "zipNames", zipNames);

  for (const zipName of zipNames) {
    console.log(new Date(), zipName);

    const match = /gamedata-(\d{14})/.exec(zipName);
    if (match === null) {
      throw new Error(`invalid zipName: ${zipName}`);
    }

    const zipDate = new Date(
      parseInt(match[1].slice(0, 4), 10),
      parseInt(match[1].slice(4, 6), 10) - 1,
      parseInt(match[1].slice(6, 8), 10),
      parseInt(match[1].slice(8, 10), 10),
      parseInt(match[1].slice(10, 12), 10),
      parseInt(match[1].slice(12, 14), 10)
    );

    const response = await axios.default.request({
      url: `https://d1wkxvul68bth9.cloudfront.net/${zipName}`,
      responseType: "arraybuffer",
    });

    await syncGameDataSub(
      repoPath,
      git,
      zipName,
      zipDate,
      await jszip.loadAsync(response.data)
    );
  }
}

async function getZipNames() {
  const versionResponse = await axios.default.request({
    url: "https://d1wkxvul68bth9.cloudfront.net/gameDb/gamedata-steam.txt",
  });
  console.log(new Date(), "latestVersion", versionResponse.data);

  // const response = await axios.default.request({
  //   url: `https://d1wkxvul68bth9.cloudfront.net/gameDb/${versionResponse.data}`,
  //   responseType: "arraybuffer",
  // });

  // const zip = await jszip.loadAsync(response.data);
  const zipSet = new Set([`gameDb/${versionResponse.data}`]);

  // for (const zipObj of Object.values(zip.files)) {
  //   if (zipObj.name.toLowerCase() === "hash.json") {
  //     for (const name of Object.keys(JSON.parse(await zipObj.async("text")))) {
  //       if (/^gameDb\/gamedata-\d{14}.zip$/.test(name) === false) {
  //         continue;
  //       }
  //       zipSet.add(name);
  //     }
  //     break;
  //   }
  // }

  return [...zipSet].sort();
}

async function syncGameDataSub(
  repoPath: string,
  git: simpleGit.SimpleGit,
  zipName: string,
  zipDate: Date,
  zip: jszip
) {
  const dataPath = path.join(repoPath, "data");
  await fs.promises.rm(dataPath, {
    force: true,
    recursive: true,
  });
  await mkdirSafe(dataPath);

  const gitFiles = [];

  for (const zipObj of Object.values(zip.files)) {
    const savePath = path.join(dataPath, zipObj.name);

    if (zipObj.dir) {
      await mkdirSafe(repoPath);
      continue;
    }

    let data: string | Buffer = await zipObj.async("nodebuffer");

    if (zipObj.name.endsWith(".json")) {
      data = JSON.stringify(JSON.parse(data.toString()), null, 2);
    }

    await fs.promises.writeFile(savePath, data);
    gitFiles.push(savePath);
  }

  console.log(new Date(), "git.add", await git.add(gitFiles));
  console.log(
    new Date(),
    "git.commit",
    await git.commit(`${zipName}`, {
      "--date": zipDate.toISOString(),
    })
  );
}

async function syncL10nData(repoPath: string, git: simpleGit.SimpleGit) {
  const dataPath = path.join(repoPath, "l10n");
  await mkdirSafe(dataPath);

  const languages = [
    "Korean",
    "English",
    "Japanese",
    "ChineseSimplified",
    "ChineseTraditional",
    "French",
    "Spanish",
    "SpanishLatin",
    "Portuguese",
    "PortugueseLatin",
    "Indonesian",
    "German",
    "Russian",
    "Thai",
    "Vietnamese",
  ];

  for (const language of languages) {
    await sleep(1000);

    const apiResponse = await api.request<{
      code: number;
      message: string;
      data: {
        l10Path: string;
      };
    }>({
      url: `/v1/l10n/${language}`,
    });
    if (apiResponse.data.code !== 200) {
      console.error(new Date(), "api", apiResponse.status, apiResponse.data);
      continue;
    }

    const url = new URL(apiResponse.data.data.l10Path);
    const l10nPath = url.pathname.slice(1);
    console.log(l10nPath);

    const match = /l10n-.*-(\d{14})/.exec(l10nPath);
    if (match === null) {
      throw new Error(`invalid l10nPath: ${l10nPath}`);
    }

    const l10nDate = new Date(
      parseInt(match[1].slice(0, 4), 10),
      parseInt(match[1].slice(4, 6), 10) - 1,
      parseInt(match[1].slice(6, 8), 10),
      parseInt(match[1].slice(8, 10), 10),
      parseInt(match[1].slice(10, 12), 10),
      parseInt(match[1].slice(12, 14), 10)
    );

    const response = await axios.default.request({
      url: apiResponse.data.data.l10Path,
      responseType: "arraybuffer",
    });

    const savePath = path.join(dataPath, `${language}.txt`);
    await fs.promises.writeFile(savePath, response.data);

    console.log(new Date(), "git.add", await git.add(savePath));
    console.log(
      new Date(),
      "git.commit",
      await git.commit(l10nPath, {
        "--date": l10nDate.toISOString(),
      })
    );
  }
}

async function syncFreeCharactersData(
  repoPath: string,
  git: simpleGit.SimpleGit
) {
  const dataPath = path.join(repoPath, "freeCharacters");
  await fs.promises.rm(dataPath, {
    force: true,
    recursive: true,
  });
  await mkdirSafe(dataPath);

  const matchingModes = [
    "2", // Normal
    "3", // Rank
    "6", // Cobalt
  ];

  for (const matchingMode of matchingModes) {
    await sleep(1000);

    const apiResponse = await api.request<{
      code: number;
      message: string;
      freeCharacters: number[];
    }>({
      url: `/v1/freeCharacters/${matchingMode}`,
    });
    if (apiResponse.data.code !== 200) {
      console.error(new Date(), "api", apiResponse.status, apiResponse.data);
      continue;
    }

    if (
      Array.isArray(apiResponse.data.freeCharacters) === false ||
      apiResponse.data.freeCharacters.length === 0
    ) {
      continue;
    }

    const savePath = path.join(dataPath, `${matchingMode}.json`);
    await fs.promises.writeFile(
      savePath,
      JSON.stringify(apiResponse.data.freeCharacters, null, 2)
    );

    console.log(new Date(), "git.add", await git.add(savePath));
    console.log(
      new Date(),
      "git.commit",
      await git.commit(`freeCharacters/${matchingMode}`)
    );
  }
}

async function mkdirSafe(dirPath: string) {
  try {
    await fs.promises.mkdir(dirPath, {
      recursive: true,
    });
  } catch {
    //
  }
}
