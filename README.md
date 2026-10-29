# EGPU Lab Codes

A study app for learning the Embedded GPU lab record codes by heart.
It only has modules, one per week, plus a Common blocks module for the lines that repeat across weeks.
Modules are sorted easiest to hardest and split into Hardware (Jetson Nano) and Software (CUDA and OpenCL).

## Run it

Double click EGPU Lab on the Desktop.
It starts a local server in the background and opens the app in your browser.
Or run ./run.sh from this folder and open http://localhost:8791/app/
The launcher source is launcher.applescript.

## How a week works

The first page shows every week as a card with the theme it covers.
Opening a week shows the lab question on the left, with aim, requirements and the expected result.
The right side has the code as small cells, like Google Colab.
Inside a cell, related lines are grouped and groups are split by a blank line.
A line that is suddenly longer or harder sits in its own group, and similar repeated lines share one group.
Learn shows one group at a time and Space shows the next group.
Hide and recall blurs the lines so you can say them from memory and tap a line to peek.
Practice blanks out parts of each line.
Python lines are typed in, C, CUDA and OpenCL lines are filled by tapping pieces.
There are three levels: few blanks, half, and whole lines.
Test is writing a cell, or the whole program, from memory and getting a line by line diff.
Comments and spacing do not count, indentation does for Python.

Each cell has three buttons.
Simplify swaps the cell for an easier version of the same code, or says it is already as simple as it gets.
Under every simplified cell the app says whether it works the same, or warns when it changes what the program does.
The bulb puts a one sentence explanation next to every line.
The question button asks a doubt and the answer stays inside the cell, older answers are behind the arrows.

## Running code

Run program, Syntax and Run with mine use a local runner, there is no GPU needed.
Python is checked and run with the system python3.
CUDA and OpenCL kernels are compiled with clang and really run on the CPU, so a wrong kernel gives a wrong answer.
Jetson.GPIO, the USB camera, pycuda and pyopencl are simulated, grey lines in the output come from the simulator.
Loops that run forever are stopped after 12 simulated seconds as if Ctrl+C was pressed.
Week 5 is C++ and runs against stub jetson-inference headers, so its classification result is made up.

## Content

The codes come from EGPU.pdf, transcribed by hand since the PDF has no text layer.
Lines the PDF wrapped are joined back into one line and a few stray spaces were removed.
Module files are in content/modules and simplified versions are in content/simple.
Line explanations are pattern rules in build/glosses.py.
Run /usr/bin/python3 build/build.py to rebuild app/data/modules.js.
Add --run to also run every original and simplified program through the simulator.

Things the PDF gets wrong are kept as they are and pointed out in the app.
Week 11 sets the start minimum after copying to the GPU, so the GPU never sees it.
Week 13 uses atomic_add_global, which is not standard OpenCL.
Week 14 leaves out the estimate_pi kernel, so the runner uses its own.

## How simplify is checked

The build runs every week with the simplified cells swapped in one by one and compares the output with the PDF version.
If a cell changes the output and has no warning written for it, the build fails.
A simplified cell also has to be measurably simpler: fewer pieces, fewer operators, less nesting or less repetition.
Cells marked helper may grow a little if the week gets shorter overall, and cells marked adds or fixes add something the PDF is missing.
Results are cached in content/simplify-checks.json, and /usr/bin/python3 build/build.py --run-simplify reruns the missing ones.

## AI answers

Doubts go to Groq through server.py and need GROQ_API_KEY in a .env file here, which is not committed.
Answers are cached in cache/answers.json so the same question is free the second time.
Progress is saved in the browser.
