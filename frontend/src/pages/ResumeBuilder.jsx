import React, { useState, useRef, useEffect } from "react";
import { useAuth, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Send, FileText, Download, RotateCcw, Sparkles, MessageSquare, Plus, Loader2, Trash2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import html2pdf from "html2pdf.js";

const INTERVIEW_STEPS = [
    { id: 'personal', type: 'personal', question: "Hi! Let's build a killer ATS-friendly resume. What is your full name, email, phone number, and location? (Provide LinkedIn/GitHub if you have them)." },
    { id: 'summary', type: 'summary', question: "Great. Now, in a few sentences, tell me about your professional background and what you are looking for in your next role." },
    { id: 'experience', type: 'experience', question: "Let's add some work experience. Tell me about your most recent job. What was your title, company, dates, and what did you achieve there?" },
    { id: 'education', type: 'education', question: "What is your highest level of education? Tell me the degree, university, and graduation year." },
    { id: 'skills', type: 'skills', question: "Finally, list some of your key technical or professional skills, separated by commas." }
];

const TEMPLATE_ROLES = [
    {
        id: 'swe',
        title: 'Software Engineer',
        summary: 'Passionate Software Engineer with experience in building scalable web applications.',
        skills: ['JavaScript', 'React', 'Node.js', 'Python', 'System Design', 'Git']
    },
    {
        id: 'pm',
        title: 'Product Manager',
        summary: 'Strategic Product Manager focused on delivering user-centric solutions and driving product roadmaps.',
        skills: ['Agile', 'Jira', 'Roadmapping', 'User Research', 'Data Analysis', 'Stakeholder Management']
    },
    {
        id: 'ds',
        title: 'Data Scientist',
        summary: 'Analytical Data Scientist skilled in machine learning, statistical modeling, and data visualization.',
        skills: ['Python', 'SQL', 'Machine Learning', 'Pandas', 'TensorFlow', 'Tableau']
    },
    {
        id: 'marketing',
        title: 'Marketing Specialist',
        summary: 'Creative Marketing Specialist with a proven track record in digital campaigns and brand growth.',
        skills: ['SEO', 'Content Strategy', 'Social Media', 'Google Analytics', 'Copywriting', 'CRM']
    }
];

export default function ResumeBuilder() {
    const { token } = useAuth();

    // Sidebar State (History)
    const [historyOpen, setHistoryOpen] = useState(true);
    const [resumes, setResumes] = useState([]);
    const [currentResumeId, setCurrentResumeId] = useState(null);
    const [showTemplateModal, setShowTemplateModal] = useState(false);

    // Interview/Chat State
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [chatLog, setChatLog] = useState([
        { role: "system", text: INTERVIEW_STEPS[0].question, stepIndex: 0 }
    ]);
    const [inputText, setInputText] = useState("");
    const [loadingAI, setLoadingAI] = useState(false);
    const chatEndRef = useRef(null);

    // Live State (JSON built over time)
    const [resumeState, setResumeState] = useState({
        name: "John Doe",
        email: "john@example.com",
        phone: "",
        location: "",
        linkedin: "",
        github: "",
        position: "Professional",
        summary: "",
        experience: [],
        education: [],
        skills: []
    });

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatLog, loadingAI]);

    // Fetch previous resumes on mount
    useEffect(() => {
        if (!token) return;
        fetchResumes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const fetchResumes = async () => {
        try {
            const res = await axios.get(`${API}/resumes`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setResumes(res.data);
        } catch (err) {
            console.error("Failed to load resumes", err);
        }
    };

    const loadResume = async (resumeId) => {
        try {
            const res = await axios.get(`${API}/resumes/${resumeId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dbResume = res.data;
            setResumeState(dbResume.content);
            setCurrentResumeId(dbResume.id);
            // Optionally, we could reset the chat here, but for MVP let's just show the preview
            setCurrentStepIndex(INTERVIEW_STEPS.length);
            setChatLog([{ role: "system", text: "Loaded from history! You can download it as PDF." }]);
        } catch (err) {
            toast.error("Failed to load resume details");
        }
    };

    const startNewResume = () => {
        setShowTemplateModal(true);
    };

    const selectTemplate = (template) => {
        setShowTemplateModal(false);
        setCurrentResumeId(null);
        setResumeState({
            name: "New Resume",
            email: "",
            phone: "",
            location: "",
            linkedin: "",
            github: "",
            position: template.title,
            summary: template.summary,
            experience: [],
            education: [],
            skills: template.skills
        });
        setCurrentStepIndex(0);
        setChatLog([
            { role: "system", text: `I see you are targeting a ${template.title} role! I've pre-filled some standard skills for you. \n\n${INTERVIEW_STEPS[0].question}`, stepIndex: 0 }
        ]);

        // Immediately save the initial template state
        saveResume({
            name: "New Resume",
            position: template.title,
            summary: template.summary,
            skills: template.skills
        });
    };

    const saveResume = async (stateToSave) => {
        try {
            const payload = {
                id: currentResumeId,
                title: stateToSave.name || "Untitled Resume",
                content: stateToSave
            };
            const res = await axios.post(`${API}/resumes`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!currentResumeId) {
                setCurrentResumeId(res.data.id);
            }
            fetchResumes(); // Refresh sidebar
        } catch (err) {
            console.error("Failed to auto-save resume:", err);
        }
    };

    const handleDeleteResume = async (id, e) => {
        e.stopPropagation(); // Prevent loading the resume when clicking delete
        if (!window.confirm("Are you sure you want to delete this resume?")) return;

        try {
            await axios.delete(`${API}/resumes/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success("Resume deleted");

            // If deleting the currently viewed resume, reset the view
            if (currentResumeId === id) {
                startNewResume();
            } else {
                fetchResumes();
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete resume");
        }
    };

    const handleSend = async () => {
        if (!inputText.trim() || loadingAI) return;
        const userMsg = inputText;
        const currentStep = INTERVIEW_STEPS[currentStepIndex];

        setChatLog(prev => [...prev, { role: "user", text: userMsg, stepIndex: currentStepIndex }]);
        setInputText("");
        setLoadingAI(true);

        try {
            const res = await axios.post(`${API}/ai/process-block`, {
                block_type: currentStep.type,
                raw_text: userMsg,
                target_role: resumeState.position // Passed to backend to guide AI prompt
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const aiData = res.data.data;

            setResumeState(prev => {
                const newState = { ...prev };
                if (currentStep.type === 'personal') {
                    if (aiData.name) newState.name = aiData.name;
                    if (aiData.email) newState.email = aiData.email;
                    if (aiData.phone) newState.phone = aiData.phone;
                    if (aiData.location) newState.location = aiData.location;
                    if (aiData.linkedin) newState.linkedin = aiData.linkedin;
                    if (aiData.github) newState.github = aiData.github;
                } else if (currentStep.type === 'summary') {
                    if (aiData.summary) newState.summary = aiData.summary;
                } else if (currentStep.type === 'experience') {
                    newState.experience = [...newState.experience, aiData];
                } else if (currentStep.type === 'education') {
                    newState.education = [...newState.education, aiData];
                } else if (currentStep.type === 'skills') {
                    if (aiData.skills) newState.skills = aiData.skills;
                }

                // Auto-save to DB
                saveResume(newState);

                return newState;
            });

            const nextIndex = currentStepIndex + 1;
            if (nextIndex < INTERVIEW_STEPS.length) {
                setCurrentStepIndex(nextIndex);
                setChatLog(prev => [...prev, { role: "system", text: INTERVIEW_STEPS[nextIndex].question, stepIndex: nextIndex }]);
            } else {
                setChatLog(prev => [...prev, { role: "system", text: "You're all done! Review your resume on the right. You can download it as a PDF." }]);
            }

        } catch (err) {
            console.error(err);
            toast.error("AI processing failed. Please try again or check your API keys.");
        } finally {
            setLoadingAI(false);
        }
    };

    const handleRollback = (stepIndex) => {
        setCurrentStepIndex(stepIndex);
        setChatLog(prev => {
            const targetIndex = prev.findIndex(msg => msg.role === 'system' && msg.stepIndex === stepIndex);
            if (targetIndex !== -1) {
                return prev.slice(0, targetIndex + 1);
            }
            return prev;
        });
    };

    const handleDownloadPDF = () => {
        const element = document.getElementById("resume-preview-content");
        if (!element) return;

        toast.info("Generating PDF...");
        const opt = {
            margin: 0,
            filename: `${resumeState.name.replace(/\s+/g, '_')}_Resume.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save()
            .then(() => toast.success("Resume downloaded successfully!"))
            .catch(err => {
                console.error("PDF generation failed:", err);
                toast.error("Failed to generate PDF.");
            });
    };

    return (
        <div className="flex relative h-[calc(100vh-6rem)] -m-8 overflow-hidden bg-muted/20">

            {/* TEMPLATE PICKER MODAL */}
            {showTemplateModal && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b">
                            <h2 className="text-2xl font-bold tracking-tight">Choose a Target Role</h2>
                            <p className="text-muted-foreground mt-1">
                                Select a template to give the AI context. This tailors the generated keywords and ATS formatting to your industry.
                            </p>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {TEMPLATE_ROLES.map(role => (
                                <div
                                    key={role.id}
                                    onClick={() => selectTemplate(role)}
                                    className="group relative cursor-pointer rounded-xl border p-5 hover:border-violet-500 hover:shadow-md transition-all bg-card"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-lg group-hover:text-violet-600 transition-colors">{role.title}</h3>
                                        <Sparkles className="h-4 w-4 text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                        {role.summary}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {role.skills?.slice(0, 3).map(s => (
                                            <span key={s} className="px-2 py-0.5 bg-muted text-xs rounded-md text-muted-foreground">{s}</span>
                                        ))}
                                        {role.skills?.length > 3 && <span className="px-2 py-0.5 bg-muted text-xs rounded-md text-muted-foreground">+{role.skills.length - 3}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t bg-muted/30 flex justify-end">
                            <Button variant="ghost" onClick={() => setShowTemplateModal(false)}>Cancel</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* 1. LEFT SIDEBAR: History */}
            {historyOpen && (
                <div className="w-64 border-r bg-background flex flex-col transition-all duration-300">
                    <div className="p-4 border-b flex items-center justify-between">
                        <h2 className="font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4" /> My Resumes
                        </h2>
                    </div>
                    <div className="p-4">
                        <Button className="w-full gap-2 mb-4" variant="outline" onClick={startNewResume}>
                            <Plus className="h-4 w-4" /> New Resume
                        </Button>
                        <div className="space-y-2">
                            {resumes.length === 0 && <p className="text-xs text-muted-foreground text-center">No resumes yet.</p>}
                            {resumes.map(r => (
                                <div
                                    key={r.id}
                                    onClick={() => loadResume(r.id)}
                                    className={`p-3 rounded-lg cursor-pointer text-sm font-medium border transition-colors group relative ${currentResumeId === r.id ? 'bg-violet-100 border-violet-300 text-violet-900' : 'bg-muted/50 border-transparent hover:bg-muted hover:border-border'}`}
                                >
                                    <div className="pr-6">{r.title}</div>
                                    <div className="text-[10px] text-muted-foreground mt-1 font-normal opacity-70">
                                        Last edited: {new Date(r.updated_at).toLocaleDateString()}
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteResume(r.id, e)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Resume"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. MIDDLE COLUMN: The AI Interviewer */}
            <div className="flex-1 flex flex-col border-r bg-background min-w-[350px]">
                <div className="p-4 border-b bg-muted/10 flex items-center justify-between">
                    <h2 className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-500" /> AI Resume Coach
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(!historyOpen)}>
                        Toggle History
                    </Button>
                </div>

                {/* Chat Log */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatLog.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`group relative max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                : 'bg-muted rounded-tl-sm'
                                }`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                {msg.role === 'user' && msg.stepIndex !== undefined && (
                                    <button
                                        onClick={() => handleRollback(msg.stepIndex)}
                                        className="absolute -left-10 top-2 p-1.5 rounded-full bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                                        title="Edit/Rollback to here"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {loadingAI && (
                        <div className="flex justify-start">
                            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="text-sm text-muted-foreground border-l pl-2">AI is thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input Box */}
                <div className="p-4 border-t bg-background">
                    <div className="relative flex items-center">
                        <Input
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Type your answer here..."
                            className="pr-12 py-6 rounded-xl border-muted-foreground/20 focus-visible:ring-violet-500"
                        />
                        <Button
                            size="icon"
                            className="absolute right-2 h-9 w-9 rounded-lg bg-violet-600 hover:bg-violet-700"
                            onClick={handleSend}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-3">
                        AI responses may take a moment. We optimize for high-quality ATS keywords.
                    </p>
                </div>
            </div>

            {/* 3. RIGHT COLUMN: Live Template Preview */}
            <div className="w-[45%] bg-muted/30 p-8 overflow-y-auto" id="resume-preview-container">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-muted-foreground uppercase text-xs tracking-wider">Live Preview</h3>
                    <Button size="sm" onClick={handleDownloadPDF} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <Download className="h-4 w-4" /> Download PDF
                    </Button>
                </div>

                {/* A4 Paper Canvas - This inner div is what gets exported */}
                <div id="resume-preview-content" className="bg-white mx-auto shadow-xl border rounded-sm min-h-[1056px] w-full max-w-[816px] p-10 flex flex-col" style={{ aspectRatio: '8.5/11' }}>

                    {/* Header */}
                    <div className="text-center border-b pb-4 mb-4">
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{resumeState.name}</h1>
                        <p className="text-gray-600 mt-1">
                            {resumeState.email} {resumeState.phone && `• ${resumeState.phone}`} {resumeState.location && `• ${resumeState.location}`}
                        </p>
                        <p className="text-gray-500 text-sm mt-1">
                            {resumeState.linkedin && <a href={resumeState.linkedin} className="hover:underline">{resumeState.linkedin}</a>}
                            {resumeState.linkedin && resumeState.github && " • "}
                            {resumeState.github && <a href={resumeState.github} className="hover:underline">{resumeState.github}</a>}
                        </p>
                    </div>

                    {/* Summary */}
                    {resumeState.summary && (
                        <div className="mb-6">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b pb-1 mb-2">Professional Summary</h2>
                            <p className="text-sm text-gray-700 leading-relaxed">{resumeState.summary}</p>
                        </div>
                    )}

                    {/* Experience Area */}
                    <div className="mb-6">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b pb-1 mb-2">Experience</h2>
                        {resumeState.experience.length === 0 ? (
                            <div className="py-8 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400">
                                <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                                <p className="text-sm">Chat with the AI to generate polished experience bullets.</p>
                            </div>
                        ) : (
                            <div className="space-y-4 text-sm text-gray-800">
                                {resumeState.experience.map((exp, i) => (
                                    <div key={i}>
                                        <div className="flex justify-between font-semibold">
                                            <span>{exp.title}</span>
                                            <span>{exp.dates}</span>
                                        </div>
                                        <div className="text-gray-600 italic mb-1">{exp.company}</div>
                                        <ul className="list-disc pl-5 space-y-1 text-gray-700">
                                            {exp.bullets?.map((b, j) => <li key={j}>{b}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Education Area */}
                    {resumeState.education.length > 0 && (
                        <div className="mb-6">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b pb-1 mb-2">Education</h2>
                            <div className="space-y-3 text-sm text-gray-800">
                                {resumeState.education.map((edu, i) => (
                                    <div key={i} className="flex justify-between">
                                        <div>
                                            <div className="font-semibold">{edu.school}</div>
                                            <div className="text-gray-700 italic">{edu.degree}</div>
                                        </div>
                                        <div className="font-semibold">{edu.year}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Skills Area */}
                    {resumeState.skills?.length > 0 && (
                        <div className="mb-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b pb-1 mb-2">Skills</h2>
                            <p className="text-sm text-gray-700">
                                {resumeState.skills.join(", ")}
                            </p>
                        </div>
                    )}

                </div>
            </div>

        </div>
    );
}
