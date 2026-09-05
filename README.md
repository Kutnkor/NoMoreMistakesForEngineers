#Kutnkor / NoMoreMistakesForEngineers
GitHub account: Kutnkor. Repository name: NoMoreMistakesForEngineers. The workspace within the application retains the name CIRCUIT FORGE.
Create the repository
On the Create a new repository page, select Kutnkor as the owner and enter NoMoreMistakesForEngineers as the name. Do not add a README, .gitignore, or license during creation; these are already included in the package.
Suggested repository description:
Browser-based electronics workbench with AI filter optimization, fault diagnosis, Arduino/ESP32/Pico exports and an interactive 3D breadboard.

Suggested topics: electronics, circuit-design, bayesian-optimization, arduino, esp32, raspberry-pi-pico, breadboard, typescript, threejs, engineering-education.
Push the prepared Git repository from this computer
Open Terminal in the project folder and run:
git push -u origin main
origin is configured as https://github.com/Kutnkor/NoMoreMistakesForEngineers.git. This command will work only after the repository has been created and GitHub authentication has been completed on this computer. Do not put passwords or access tokens in source files. Once you have created the repository, you can send its link to Codex.
If you are using the ZIP on another computer
Extract the ZIP. The folder should contain package.json, README.md, and the hidden .github folder. Instead of uploading the ZIP to GitHub as a single file, push its source files using Git:
cd NoMoreMistakesForEngineers
git init -b main
git add .
git commit -m "Initial release: Circuit Forge engineering workbench"
git remote add origin https://github.com/Kutnkor/NoMoreMistakesForEngineers.git
git push -u origin main
If Git asks for a name and email address before the first commit, configure your own GitHub commit identity. The prepared copy on this computer uses Kutnkor and the corresponding GitHub noreply email address.
Installation and verification
Node.js 24 must be installed. Then run:
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
Run pnpm check to verify the production build, then pnpm start to serve it locally. Open http://127.0.0.1:4173.
After the first push, GitHub Actions runs linting, TypeScript checks, tests, the production build, and checks of the compiled Workers. Passing locally does not mean these checks have already run on GitHub. The workflow does not automatically publish the website.
What is included
The package contains an English README, Turkish technical documentation, methods, experiment reports, training scripts, the model, and existing product images. Raw private NPZ datasets, account credentials, private Sites deployment settings, and the dependency folder are excluded.
An MIT license has been prepared for the code. Product photographs retain their separate rights; an open license has not been verified for every photograph. See THIRD_PARTY_NOTICES.md and research/image-sources.json for details.
In your application materials, accurately describe your actual contributions, the experiments you understand and can reproduce, and the AI assistance you used. Do not present synthetic test results as evidence of physical circuit performance.
Source: GitHub’s guide to adding locally hosted code to GitHub.
