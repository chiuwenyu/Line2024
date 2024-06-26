import { invoke } from "@tauri-apps/api/tauri";

import React from "react";
import { useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import DataGridSingle from "./DataGridSingle";
import { SizingData } from "./DataGridSingle";
import pipeData from "../../assets/PipeStd.json";
import workID from "../../assets/PipeWork.json";
import { dialog } from "@tauri-apps/api";
import { writeTextFile, readTextFile, BaseDirectory } from "@tauri-apps/api/fs";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";

import {
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PasteDialog from "./PasteDialog";
import { OptDiaErrorDialog, OptPresErrorDialog } from "./OptErrorDialog";
import { SingleData, Result } from "./SingleDataType";
import FileButton from "./FileButton";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// 將 num 輸出格式化的 scientific format to 1.23E+002
function fmt_f64(
  num: number,
  width: number,
  precision: number,
  exp_pad: number
): string {
  let numStr: string = num.toExponential(precision);
  let eIndex: number = numStr.indexOf("e");
  let exp: string = numStr.slice(eIndex + 1);
  numStr = numStr.slice(0, eIndex);
  let sign: string = exp.startsWith("-") ? "-" : "+";
  if (sign === "-") {
    exp = exp.slice(1);
  } else {
    exp = exp.slice(1);
  }
  numStr += "E" + sign + exp.padStart(exp_pad, "0");
  return numStr.padStart(width);
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

export const Single = () => {
  // Program Data
  const [fileName, setFileName] = useState("");

  // Process Data
  const [fluid, setFluid] = useState(10);
  const [massFlowRate, setMassFlowRate] = useState("150734");
  const [density, setDensity] = useState("380");
  const [viscosity, setViscosity] = useState("0.054");
  const [roughness, setRoughness] = useState("0.046");
  const [safeFactor, setSafeFactor] = useState("1.0");

  // Options
  const [lowPres, setLowPres] = useState("0.01");
  const [highPres, setHighPres] = useState("1.00");
  const [lowID, setLowID] = useState("1");
  const [highID, setHighID] = useState("6");
  const [optValue, setOptValue] = useState("1");
  const [optDiaErrOpen, setOptDiaErrOpen] = useState(false);
  const [optPresErrOpen, setOptPresErrOpen] = useState(false);

  // Project Info
  const [projNo, setProjectNo] = useState("");
  const [projName, setProjectName] = useState("");
  const [projDesc, setProjectDesc] = useState("");

  // // Line Tag
  const [lineNo, setLineNo] = useState("");
  const [lineFrom, setLineFrom] = useState("");
  const [lineTo, setLineTo] = useState("");
  const [note, setNote] = useState("");

  // Error handling
  const [error, setError] = useState(false);

  // Tab value
  const [value, setValue] = useState(0);

  // Calculated Result
  const [resData, setResData] = useState<SizingData[]>([]);
  const [calState, setCalState] = useState(false);

  // handle ID select
  const nids = pipeData.map((item) => {
    return (
      <MenuItem key={item.VALUE} value={item.SIZE}>
        {item.SIZE}
      </MenuItem>
    );
  });

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const validateInput = (value: any) => {
    // 驗證輸入值是否為正的浮點數
    const isPositiveFloat = /^([0-9]*[.])?[0-9]+$/;
    if (!isPositiveFloat.test(value)) {
      setError(true);
      setCalState(true);
    } else {
      setError(false);
      setCalState(false);
    }
  };

  const handleExecuteButtonClick = async () => {
    if (optValue === "1") {
      // implement by all dia.
      const newResData: SizingData[] = [];
      await Promise.all(
        workID.map(async (item) => {
          let [v, dp, vhead, nre] = await rust_single_phase_hydraulic_byid(
            item.ID
          );
          newResData.push({
            id: item.SIZE,
            actID: item.ID.toString(),
            vel: v,
            presDrop: dp,
            vh: vhead,
            reynoldNo: nre,
          });
        })
      );

      setResData(newResData);
      setCalState(true);
    }

    if (optValue === "2") {
      // optValue = 2, implement by Dia range
      let lowActID = workID.find((item) => item.SIZE === lowID)?.ID || 0;
      let highActID = workID.find((item) => item.SIZE === highID)?.ID || 0;
      if (lowActID >= highActID) {
        setOptDiaErrOpen(true);
        return;
      }

      const newResData: SizingData[] = [];
      await Promise.all(
        workID.map(async (item) => {
          let [v, dp, vhead, nre] = await rust_single_phase_hydraulic_byid(
            item.ID
          );
          if (item.ID >= lowActID && item.ID <= highActID) {
            newResData.push({
              id: item.SIZE,
              actID: item.ID.toString(),
              vel: v,
              presDrop: dp,
              vh: vhead,
              reynoldNo: nre,
            });
          }
        })
      );

      setResData(newResData);
      setCalState(true);
    }
    if (optValue === "3") {
      // implement by pressure drop range
      let lowDP = parseFloat(lowPres);
      let highDP = parseFloat(highPres);
      if (lowDP >= highDP) {
        setOptPresErrOpen(true);
        return;
      }

      const newResData: SizingData[] = [];
      await Promise.all(
        workID.map(async (item) => {
          let [v, dp, vhead, nre] = await rust_single_phase_hydraulic_byid(
            item.ID
          );
          if (parseFloat(dp) > lowDP && parseFloat(dp) < highDP) {
            newResData.push({
              id: item.SIZE,
              actID: item.ID.toString(),
              vel: v,
              presDrop: dp,
              vh: vhead,
              reynoldNo: nre,
            });
          }
        })
      );

      // judge the pressure drop range here
      setResData(newResData);
      setCalState(true);
    }
  };

  async function rust_single_phase_hydraulic_byid(
    actID: number
  ): Promise<[string, string, string, string]> {
    try {
      const result = await invoke<Result>("invoke_hydraulic", {
        w: parseFloat(massFlowRate),
        rho: parseFloat(density),
        mu: parseFloat(viscosity),
        id: actID,
        e: parseFloat(roughness),
        sf: parseFloat(safeFactor),
      });
      const res = result as Result;
      return [
        res.v.toFixed(4),
        res.dp100.toFixed(6),
        res.vh.toFixed(4),
        fmt_f64(res.nre, 20, 4, 3),
      ];
    } catch (e) {
      console.error(e);
      return ["", "", "", ""];
    }
  }

  const onSaveAsButtonClick = async () => {
    dialog
      .save({
        defaultPath: "data1.lns", // 預設檔案名稱
        filters: [{ name: "Line Sizing Files", extensions: ["lns"] }], // 檔案類型過濾器
        title: "Save File As",
      })
      .then(async (result) => {
        if (result !== null) {
          const data: SingleData = {
            Single_ProcessData: {
              Single_FluidType: fluid.toString(),
              Single_MassFlowRate: massFlowRate,
              Single_Density: density,
              Single_Viscosity: viscosity,
              Single_Roughness: roughness,
              Single_SafeFactor: safeFactor,
            },
            Single_OptionData: {
              Single_lowPres: lowPres,
              Single_highPres: highPres,
              Single_lowID: lowID,
              Single_highID: highID,
              Single_OptValue: optValue,
            },
            Single_ProjectData: {
              Single_projNo: projNo,
              Single_projName: projName,
              Single_projDesc: projDesc,
            },
            Single_LineData: {
              Single_lineNo: lineNo,
              Single_lineFrom: lineFrom,
              Single_lineTo: lineTo,
              Single_note: note,
            },
          };
          const jsonData = JSON.stringify(data);

          setFileName(result);
          await writeTextFile(result, jsonData, {
            dir: BaseDirectory.AppConfig,
          });
        } else {
          console.log("Cancelled by user.");
        }
      })
      .catch((error) => {
        console.error("Error saving data:", error.message);
      });
  };

  const onSaveButtonClick = async () => {
    if (fileName !== "") {
      try {
        const data: SingleData = {
          Single_ProcessData: {
            Single_FluidType: fluid.toString(),
            Single_MassFlowRate: massFlowRate,
            Single_Density: density,
            Single_Viscosity: viscosity,
            Single_Roughness: roughness,
            Single_SafeFactor: safeFactor,
          },
          Single_OptionData: {
            Single_lowPres: lowPres,
            Single_highPres: highPres,
            Single_lowID: lowID,
            Single_highID: highID,
            Single_OptValue: optValue,
          },
          Single_ProjectData: {
            Single_projNo: projNo,
            Single_projName: projName,
            Single_projDesc: projDesc,
          },
          Single_LineData: {
            Single_lineNo: lineNo,
            Single_lineFrom: lineFrom,
            Single_lineTo: lineTo,
            Single_note: note,
          },
        };
        const jsonData = JSON.stringify(data);
        const filePath = fileName;
        setFileName(filePath);
        await writeTextFile(filePath, jsonData, {
          dir: BaseDirectory.AppConfig,
        });
      } catch (error: any) {
        console.error("Error saving data:", error.message);
      }
    } else {
      onSaveAsButtonClick();
    }
  };

  const onNewButtonClick = async () => {
    // reset program data
    setFileName("");
    setCalState(false);
    setResData([]);

    // reset process data
    setFluid(10);
    setMassFlowRate("");
    setDensity("");
    setViscosity("");
    setRoughness("");
    setSafeFactor("1.0");

    // reset options data
    setLowPres("");
    setHighPres("");
    setLowID("");
    setHighID("");
    setOptValue("1");
    setOptDiaErrOpen(false);
    setOptPresErrOpen(false);

    // reset project data
    setProjectNo("");
    setProjectName("");
    setProjectDesc("");

    // reset line data
    setLineNo("");
    setLineFrom("");
    setLineTo("");
    setNote("");
    // rest error handling
    setError(false);
    // reset Tab value
    setValue(0);
  };

  const onOpenButtonClick = async () => {
    dialog
      .open({
        filters: [{ name: "Line Sizing Files", extensions: ["lns"] }], // 檔案類型過濾器
        title: "Open File",
      })
      .then(async (result) => {
        if (result !== null) {
          setFileName(result as string);
          await readTextFile(result as string, {
            dir: BaseDirectory.AppConfig,
          }).then((data) => {
            const jsonData = data as string;
            const objData = JSON.parse(jsonData);
            // set process data
            setFluid(parseInt(objData.Single_ProcessData.Single_FluidType));
            setMassFlowRate(objData.Single_ProcessData.Single_MassFlowRate);
            setDensity(objData.Single_ProcessData.Single_Density);
            setViscosity(objData.Single_ProcessData.Single_Viscosity);
            setRoughness(objData.Single_ProcessData.Single_Roughness);
            setSafeFactor(objData.Single_ProcessData.Single_SafeFactor);
            // set options data
            setLowPres(objData.Single_OptionData.Single_lowPres);
            setHighPres(objData.Single_OptionData.Single_highPres);
            setLowID(objData.Single_OptionData.Single_lowID);
            setHighID(objData.Single_OptionData.Single_highID);
            setOptValue(objData.Single_OptionData.Single_OptValue);
            // set project data
            setProjectNo(objData.Single_ProjectData.Single_projNo);
            setProjectName(objData.Single_ProjectData.Single_projName);
            setProjectDesc(objData.Single_ProjectData.Single_projDesc);
            // set line data
            setLineNo(objData.Single_LineData.Single_lineNo);
            setLineFrom(objData.Single_LineData.Single_lineFrom);
            setLineTo(objData.Single_LineData.Single_lineTo);
            setNote(objData.Single_LineData.Single_note);
          });
        } else {
          console.log("Cancelled by user.");
        }
      })
      .catch((error) => {
        console.error("Error reading data:", error.message);
      });
  };

  const onExportButtonClick = async () => {
    const pdfDoc = await PDFDocument.create();

    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    // **** Print Header (Application Name) ****
    let fontSize = 16;
    let dy = height - 4 * fontSize;
    let dx = 450;
    let textStr = "Line2024";
    let textWidth = timesRomanFont.widthOfTextAtSize(textStr, fontSize);
    page.drawText(textStr, {
      x: dx,
      y: dy,
      size: fontSize,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    fontSize = 6;
    page.drawText("   Ver 1.0.0", {
      x: dx + textWidth,
      y: dy,
      size: fontSize,
      font: timesRomanFont,
      color: rgb(0, 0, 0),
    });

    // draw a thick red line at the bottom of header
    const widthMargine = 30;
    page.drawLine({
      start: { x: widthMargine, y: dy - 5 },
      end: { x: width - widthMargine, y: dy - 5 },
      thickness: 1,
      color: rgb(1, 0, 0),
    });

    // **** Print Input Data ****
    let txtStrs: string[] = [
      `Project No. : ${projNo}`,
      `Project Name : ${projName}`,
      `Description : ${projDesc}`,
      `Line No. : ${lineNo}`,
      `From : ${lineFrom}`,
      `To : ${lineTo}`,
      `Note : ${note}`,
      `    `,
      `>>>> INPUT DATA <<<<`,
      `Fluid Type : ${
        fluid === 10
          ? "Liquid"
          : fluid === 20
          ? "Gas"
          : fluid === 30
          ? "Steam"
          : fluid === 40
          ? "Water"
          : ""
      }`,
      `Mass Flow Rate (Kg/hr): ${massFlowRate}`,
      `Density (Kg/m^3): ${density} `,
      `Viscosity (cP): ${viscosity} `,
      `Pipe Roughness (mm): ${roughness} `,
      `Safe Factor : ${safeFactor}`,
      `    `,
      `>>>> CALCULATION RESULT  <<<<`,
      `  Norm. ID         Act. ID        Velocity         Pressure Drop          1.0 V.H         Reynold No.`,
      `   (inch)          (inch)          (m/s)           (Kg/cm^2/100m)        (Kg/m/s^2)           [-]`,
    ];
    dy = dy - 5;
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
    const courierBoldFont = await pdfDoc.embedFont(StandardFonts.CourierBold);
    fontSize = 8;
    const lineSpacing = 2;
    const lineHeight = fontSize + lineSpacing;
    dx = widthMargine + 5;

    for (let i = 0; i < txtStrs.length; i++) {
      dy = dy - lineHeight * 1.5;
      if (i === 8 || i === 16) {
        page.drawText(txtStrs[i], {
          x: dx,
          y: dy,
          size: fontSize,
          font: courierBoldFont,
          color: rgb(0, 0, 0),
        });
      } else {
        page.drawText(txtStrs[i], {
          x: dx,
          y: dy,
          size: fontSize,
          font: courierFont,
          color: rgb(0, 0, 0),
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfDataUrl = URL.createObjectURL(
      new Blob([pdfBytes], { type: "application/pdf" })
    );
    window.open(pdfDataUrl);
  };

  return (
    <>
      <Stack direction="row" spacing={1.5} marginBottom={"20px"}>
        <FileButton
          onNewButtonClick={onNewButtonClick}
          onOpenButtonClick={onOpenButtonClick}
          onSaveButtonClick={onSaveButtonClick}
          onSaveAsButtonClick={onSaveAsButtonClick}
          onExportButtonClick={onExportButtonClick}
        />

        {fileName !== "" && (
          <Stack
            direction={"row"}
            spacing={1}
            alignItems={"center"}
            color={"primary.main"}
          >
            <FolderOpenIcon />
            <Typography variant="body2">{fileName}</Typography>
          </Stack>
        )}
      </Stack>
      <Grid
        container
        // alignItems="center"
        gap={6}
        sx={{
          bgcolor: "background.default",
          minHeight: "80vh",
          marginLeft: "8px",
        }}
      >
        <Grid item xs={4} sx={{ ml: 1 }}>
          <Typography
            gutterBottom
            variant="h5"
            component="div"
            sx={{ fontWeight: "medium" }}
          >
            Single Phase Line Sizing App
          </Typography>
          <Box sx={{ width: "100%", height: "550px" }}>
            <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tabs
                value={value}
                textColor="secondary"
                indicatorColor="secondary"
                onChange={handleChange}
                aria-label="basic tabs"
              >
                <Tab label="Process" {...a11yProps(0)} />
                <Tab label="Options" {...a11yProps(1)} />
                <Tab label="Project" {...a11yProps(2)} />
                <Tab label="Line Tag" {...a11yProps(3)} />
              </Tabs>
            </Box>
            {/* process data input page */}
            <CustomTabPanel value={value} index={0}>
              <Box
                component="form"
                display="flex"
                flexDirection="column"
                sx={{
                  "& .MuiTextField-root": { mt: 2, width: "25ch" },
                }}
              >
                <FormControl sx={{ mt: 2 }}>
                  <InputLabel id="state-label">Fluid</InputLabel>
                  <Select
                    labelId="state-label"
                    id="state-select"
                    value={fluid}
                    label="Fluid"
                    onChange={(e) => {
                      setFluid(e.target.value as number);
                    }}
                    sx={{ width: "20ch" }}
                  >
                    <MenuItem value={10}>Liquid</MenuItem>
                    <MenuItem value={20}>Gas</MenuItem>
                    <MenuItem value={30}>Steam</MenuItem>
                    <MenuItem value={40}>Water</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  id="outlined-basic"
                  label="Mass Flow Rate (Kg/hr)"
                  variant="outlined"
                  value={massFlowRate}
                  color="secondary"
                  error={error}
                  helperText={error ? "Please input correct number" : ""}
                  onChange={(e) => {
                    setMassFlowRate(e.target.value);
                    validateInput(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Density (Kg/m^3)"
                  variant="outlined"
                  value={density}
                  color="secondary"
                  error={error}
                  helperText={error ? "Please input correct number" : ""}
                  onChange={(e) => {
                    setDensity(e.target.value);
                    validateInput(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Viscosity (cP)"
                  variant="outlined"
                  value={viscosity}
                  color="secondary"
                  error={error}
                  helperText={error ? "Please input correct number" : ""}
                  onChange={(e) => {
                    setViscosity(e.target.value);
                    validateInput(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Pipe Roughness (mm)"
                  variant="outlined"
                  value={roughness}
                  color="secondary"
                  error={error}
                  helperText={error ? "Please input correct number" : ""}
                  onChange={(e) => {
                    setRoughness(e.target.value);
                    validateInput(e.target.value);
                  }}
                />

                <TextField
                  id="outlined-basic"
                  label="Safe Factor (-)"
                  variant="outlined"
                  value={safeFactor}
                  color="secondary"
                  error={error}
                  helperText={error ? "Please input correct number" : ""}
                  onChange={(e) => {
                    setSafeFactor(e.target.value);
                    validateInput(e.target.value);
                  }}
                />
              </Box>
            </CustomTabPanel>

            {/* options page */}
            <CustomTabPanel value={value} index={1}>
              <Box
                component="form"
                display="flex"
                flexDirection="column"
                sx={{
                  "& .MuiTextField-root": { mt: 2, width: "16ch" },
                }}
              >
                <FormControl>
                  <FormLabel id="radio-buttons-group-label">
                    Design Criteria :
                  </FormLabel>
                  <Box
                    height="42ch"
                    boxShadow={1}
                    sx={{ border: "1px solid lightgrey", mt: 1, pl: 2 }}
                  >
                    <RadioGroup
                      aria-labelledby="radio-buttons-group-label"
                      name="radio-buttons-group"
                      value={optValue}
                      onChange={(e) => setOptValue(e.target.value)}
                    >
                      <FormControlLabel
                        value="1"
                        control={<Radio />}
                        label="all diameters"
                        sx={{ mt: 2 }}
                      />
                      <FormControlLabel
                        value="2"
                        control={<Radio />}
                        label="by Diameter range"
                        sx={{ mt: 2 }}
                      />
                      <Grid>
                        <FormControl
                          sx={{ ml: 4, mt: 2, minWidth: 130 }}
                          size="medium"
                          disabled={optValue !== "2"}
                        >
                          <InputLabel id="lowID-select-standard-label">
                            Lower ID
                          </InputLabel>
                          <Select
                            labelId="lowID-select-standard-label"
                            id="lowID-select-standard"
                            value={lowID}
                            onChange={(e) => setLowID(e.target.value)}
                            label="Low ID"
                          >
                            {nids}
                          </Select>
                        </FormControl>
                        <FormControl
                          sx={{ ml: 4, mt: 2, minWidth: 130 }}
                          size="medium"
                          disabled={optValue !== "2"}
                        >
                          <InputLabel id="highID-select-standard-label">
                            Higher ID
                          </InputLabel>
                          <Select
                            labelId="highID-select-standard-label"
                            id="highID-select-standard"
                            value={highID}
                            onChange={(e) => setHighID(e.target.value)}
                            label="High ID"
                          >
                            {nids}
                          </Select>
                        </FormControl>
                      </Grid>

                      <FormControlLabel
                        value="3"
                        control={<Radio />}
                        label="by Pressure Drop (Kg/cm^2/100m) range"
                        sx={{ mt: 2 }}
                      />
                      <Grid
                        alignItems="center"
                        display="flex"
                        flexDirection="row"
                      >
                        <TextField
                          id="outlined-basic"
                          label="Low limit"
                          variant="outlined"
                          value={lowPres}
                          color="secondary"
                          error={error}
                          helperText={
                            error ? "Please input correct number" : ""
                          }
                          onChange={(e) => {
                            setLowPres(e.target.value);
                            validateInput(e.target.value);
                          }}
                          sx={{ ml: 4 }}
                          disabled={optValue !== "3"}
                        />
                        <TextField
                          id="outlined-basic"
                          label="High limit"
                          variant="outlined"
                          value={highPres}
                          color="secondary"
                          error={error}
                          helperText={
                            error ? "Please input correct number" : ""
                          }
                          onChange={(e) => {
                            setHighPres(e.target.value);
                            validateInput(e.target.value);
                          }}
                          sx={{ ml: 4 }}
                          disabled={optValue !== "3"}
                        />
                      </Grid>
                    </RadioGroup>
                  </Box>
                </FormControl>
              </Box>
            </CustomTabPanel>

            {/* project info page */}
            <CustomTabPanel value={value} index={2}>
              <Box
                component="form"
                display="flex"
                flexDirection="column"
                sx={{
                  "& .MuiTextField-root": { mt: 2, width: "45ch" },
                }}
              >
                <TextField
                  id="outlined-basic"
                  label="Project No."
                  variant="outlined"
                  value={projNo}
                  color="secondary"
                  onChange={(e) => {
                    setProjectNo(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Project Name"
                  variant="outlined"
                  value={projName}
                  color="secondary"
                  multiline
                  rows={3}
                  onChange={(e) => {
                    setProjectName(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Project Description"
                  variant="outlined"
                  value={projDesc}
                  color="secondary"
                  multiline
                  rows={7}
                  onChange={(e) => {
                    setProjectDesc(e.target.value);
                  }}
                />
              </Box>
            </CustomTabPanel>

            {/* Line tag page */}
            <CustomTabPanel value={value} index={3}>
              <Box
                component="form"
                display="flex"
                flexDirection="column"
                sx={{
                  "& .MuiTextField-root": { mt: 2, width: "45ch" },
                }}
              >
                <TextField
                  id="outlined-basic"
                  label="Line No."
                  variant="outlined"
                  value={lineNo}
                  color="secondary"
                  onChange={(e) => {
                    setLineNo(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Line From"
                  variant="outlined"
                  value={lineFrom}
                  color="secondary"
                  onChange={(e) => {
                    setLineFrom(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Line To"
                  variant="outlined"
                  value={lineTo}
                  color="secondary"
                  onChange={(e) => {
                    setLineTo(e.target.value);
                  }}
                />
                <TextField
                  id="outlined-basic"
                  label="Note"
                  variant="outlined"
                  value={note}
                  color="secondary"
                  multiline
                  rows={6}
                  onChange={(e) => {
                    setNote(e.target.value);
                  }}
                />
              </Box>
            </CustomTabPanel>
          </Box>
          <Button
            variant="contained"
            color="success"
            onClick={handleExecuteButtonClick}
            sx={{ borderRadius: "20px" }}
          >
            {" "}
            Execute{" "}
          </Button>
          <PasteDialog setDensity={setDensity} setViscosity={setViscosity} />
          <OptDiaErrorDialog
            optErrOpen={optDiaErrOpen}
            setOptErrOpen={setOptDiaErrOpen}
          />
          <OptPresErrorDialog
            optErrOpen={optPresErrOpen}
            setOptErrOpen={setOptPresErrOpen}
          />
        </Grid>
        <Grid item xs={4} sx={{ width: "100%" }}>
          {calState && <DataGridSingle rows={resData} />}
        </Grid>
      </Grid>
    </>
  );
};

export default Single;
