# Kindelia Contributing Guide

Please read first the **[general contributing
guide](https://github.com/Kindelia/docs/blob/main/CONTRIBUTING.md)**.

Below are instructions specific for this repository.

## Setting up your local environment

### Fork and clone

[Fork the project on
GitHub](https://docs.github.com/en/get-started/quickstart/fork-a-repo) and clone
your fork locally.

```sh
$ git clone git@github.com:USERNAME/ubilog.git
$ cd ubilog
$ git remote add upstream https://github.com/Kindelia/ubilog
$ git fetch upstream
```

### Branch

Create local branches to hold your work. These should be branched directly off
of the `master` branch.

```sh
$ git checkout -b my-branch -t upstream/master
```

### TypeScript / Deno

#### Run a node 

You must have [Deno](https://deno.land) installed.

```
cd ./typescript
./run-ubilog.sh --mine --display
```

#### Running multiple nodes with `dtach`

You must have [`dtach`](https://github.com/crigler/dtach) installed.

```
cd ./typescript
TODO
```
