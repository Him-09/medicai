import re, os

filepath = os.path.join('frontend', 'app', 'consultations', '[id]', 'page.tsx')
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

original_lines = content.count('\n')
changes = []

# 1. Replace first SmartInput (agenda) with Input
old1 = '<SmartInput\n                      placeholder="Ajouter un \xe9l\xe9ment..."\n                      value={newAgendaItem}\n                      onChange={setNewAgendaItem}\n                      className="flex-1"\n                      onKeyDown={(e) => {'
new1 = '<Input\n                      placeholder="Ajouter un \xe9l\xe9ment..."\n                      value={newAgendaItem}\n                      onChange={(e) => setNewAgendaItem(e.target.value)}\n                      className="flex-1"\n                      onKeyDown={(e) => {'
if old1 in content:
    content = content.replace(old1, new1)
    changes.append("1. Replaced agenda SmartInput with Input")
else:
    changes.append("1. SKIPPED - agenda SmartInput not found")

# 2. Replace plan item SmartInput with Textarea
old2 = """<SmartInput
                                  value={planItem.text}
                                  onChange={(newText) => {
                                    setProblems(prev => prev.map(p =>
                                      p.id === problem.id
                                        ? {
                                            ...p,
                                            plan: {
                                              ...p.plan,
                                              [activeTab]: p.plan[activeTab as keyof typeof p.plan].map(item =>
                                                item.id === planItem.id ? { ...item, text: newText } : item
                                              ),
                                            }
                                          }
                                        : p
                                    ));
                                  }}
                                  placeholder="dx: rx: lab: order:"
                                  autoFocus
                                  patientId={patientId}
                                  consultationId={consultationId}
                                  section="plan"
                                  fieldType="plan_item"
                                  problemId={problem.id}
                                  bucket={activeTab as any}
                                  activeProblems={problems.map(p => p.title)}
                                  visitFocus={visitFocus}
                                  showTriggerHints
                                  onBlur={() => {"""
new2 = """<Textarea
                                  value={planItem.text}
                                  onChange={(e) => {
                                    const newText = e.target.value;
                                    setProblems(prev => prev.map(p =>
                                      p.id === problem.id
                                        ? {
                                            ...p,
                                            plan: {
                                              ...p.plan,
                                              [activeTab]: p.plan[activeTab as keyof typeof p.plan].map(item =>
                                                item.id === planItem.id ? { ...item, text: newText } : item
                                              ),
                                            }
                                          }
                                        : p
                                    ));
                                  }}
                                  placeholder="Ajouter un \xe9l\xe9ment..."
                                  autoFocus
                                  className="min-h-[40px]"
                                  onBlur={() => {"""
if old2 in content:
    content = content.replace(old2, new2)
    changes.append("2. Replaced plan item SmartInput with Textarea")
else:
    changes.append("2. SKIPPED - plan item SmartInput not found")

# 3. Remove orders badge IIFE
old3 = """              {}
              {(() => {
                const totalIntents = workspaceOrders.rx_intents.length +
                                    workspaceOrders.referral_intents.length +
                                    workspaceOrders.followup_intents.length;
                const draftDocs = workspaceOrders.documents.filter(d => d.status === 'draft').length;
                const pendingActions = workspaceOrders.pending_actions.filter(a => a.status === 'pending').length;

                if (totalIntents === 0) return null;
                return (
                  <Badge variant="outline" className={`h-4 text-[10px] px-1.5 ${
                    draftDocs > 0 || pendingActions > 0 ? 'text-muted-foreground border-border' :
                    'text-accent-foreground border-accent'
                  }`}>
                    {draftDocs > 0 ? `${draftDocs} brouillon${draftDocs !== 1 ? 's' : ''}` :
                    pendingActions > 0 ? `${pendingActions} action${pendingActions !== 1 ? 's' : ''} en attente` :
                    <><Check className="h-2.5 w-2.5 mr-0.5" /> {totalIntents} ordonnance{totalIntents !== 1 ? 's' : ''}</>}
                  </Badge>
                );
              })()}"""
if old3 in content:
    content = content.replace(old3, '')
    changes.append("3. Removed orders badge IIFE block")
else:
    changes.append("3. SKIPPED - orders badge IIFE not found")

# 4. Remove plan item order linkage variable declarations
old4 = """
                          const linkedRxIntent = planItem.linkedOrderId
                            ? workspaceOrders.rx_intents.find(rx => rx.id === planItem.linkedOrderId)
                            : null;
                          const linkedReferralIntent = planItem.linkedOrderId
                            ? workspaceOrders.referral_intents.find(ref => ref.id === planItem.linkedOrderId)
                            : null;
                          const linkedFollowupIntent = planItem.linkedOrderId
                            ? workspaceOrders.followup_intents.find(fu => fu.id === planItem.linkedOrderId)
                            : null;
                          const hasLinkedOrder = linkedRxIntent || linkedReferralIntent || linkedFollowupIntent;

                          const linkedOrdoIds = planItem.linkedOrdoIds ?? (planItem.linkedOrdoId ? [planItem.linkedOrdoId] : []);
                          const linkedOrdoItems = linkedOrdoIds
                            .map(id => ordoItems.find(o => o.id === id))
                            .filter(Boolean) as OrdoItem[];
                          const hasLinkedOrdo = linkedOrdoItems.length > 0;
                          const hasAnyLink = hasLinkedOrder || hasLinkedOrdo;

                          const candidates: OrdoCandidate[] = planItem.text.trim() && !hasAnyLink
                            ? resolveOrdoCandidates(planItem.text, { bucket: activeTab, problemTitle: problem.title })
                            : [];
                          const best = candidates[0];
                          const second = candidates[1];
                          const isLowConfidence = !best || best.score < 0.45;
                          const isAmbiguous = !!(best && second && best.score >= 0.45 && (best.score - second.score) < 0.15);"""
if old4 in content:
    content = content.replace(old4, '')
    changes.append("4. Removed plan item order linkage variables")
else:
    changes.append("4. SKIPPED - linkage variables not found")

# 5. Simplify plan item div className (remove hasAnyLink)
old5 = """<div key={planItem.id} className={`group flex items-start gap-2 relative pr-16 ${hasAnyLink ? 'bg-accent/10 dark:bg-accent/5 rounded px-2 py-1 -mx-2' : ''}`}>"""
new5 = """<div key={planItem.id} className="group flex items-start gap-2 relative pr-16">"""
if old5 in content:
    content = content.replace(old5, new5)
    changes.append("5. Simplified plan item div className")
else:
    changes.append("5. SKIPPED - hasAnyLink className not found")

# 6. Remove hasLinkedOrder badge block
old6 = """                                  {}
                                  {hasLinkedOrder && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] h-4 px-1.5 cursor-pointer bg-accent/10 text-accent-foreground border-accent"
                                        onClick={() => setExpandedSections({...expandedSections, orders: true})}
                                        title="Cliquer pour voir dans les ordonnances"
                                      >
                                        {linkedRxIntent && '\U0001f48a Rx'}
                                        {linkedReferralIntent && '\U0001f464 R\xe9f\xe9rence'}
                                        {linkedFollowupIntent && '\U0001f4c5 Suivi'}
                                      </Badge>
                                    </div>
                                  )}"""
if old6 in content:
    content = content.replace(old6, '')
    changes.append("6. Removed hasLinkedOrder badge block")
else:
    changes.append("6. SKIPPED - hasLinkedOrder badge not found")

# 7. Remove hasLinkedOrdo badge block
old7 = """                                  {}
                                  {hasLinkedOrdo && linkedOrdoItems[0] && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] h-4 px-1.5 cursor-pointer bg-accent/10 text-accent-foreground border-accent"
                                        onClick={() => setExpandedSections({...expandedSections, orders: true})}
                                        title="Cliquer pour voir dans Ordo Bucket"
                                      >
                                        {linkedOrdoItems.length === 1 ? (
                                          <>
                                            {getOrdoTypeIcon(linkedOrdoItems[0].type)} {linkedOrdoItems[0].type === 'medication' ? 'Rx' : linkedOrdoItems[0].type === 'lab' ? 'Labo' : linkedOrdoItems[0].type === 'imaging' ? 'Imagerie' : 'Acte'}
                                          </>
                                        ) : (
                                          <>
                                            \U0001f4c4 Ordo x{linkedOrdoItems.length}
                                          </>
                                        )}
                                      </Badge>
                                    </div>
                                  )}"""
if old7 in content:
    content = content.replace(old7, '')
    changes.append("7. Removed hasLinkedOrdo badge block")
else:
    changes.append("7. SKIPPED - hasLinkedOrdo badge not found")

# 8. Remove order cleanup in delete button
old8 = """                                      if (planItem.linkedOrderId) {
                                        setWorkspaceOrders(prev => ({
                                          ...prev,
                                          rx_intents: prev.rx_intents.filter(rx => rx.id !== planItem.linkedOrderId),
                                          referral_intents: prev.referral_intents.filter(ref => ref.id !== planItem.linkedOrderId),
                                          followup_intents: prev.followup_intents.filter(fu => fu.id !== planItem.linkedOrderId),
                                        }));
                                      }

                                      const ids = planItem.linkedOrdoIds ?? (planItem.linkedOrdoId ? [planItem.linkedOrdoId] : []);
                                      if (ids.length > 0) {
                                        setOrdoItems(prev => prev.filter(o => !ids.includes(o.id)));
                                      }
                                      setProblems"""
new8 = """                                      setProblems"""
if old8 in content:
    content = content.replace(old8, new8)
    changes.append("8. Removed order cleanup in plan item delete")
else:
    changes.append("8. SKIPPED - order cleanup in delete not found")

# 9. Remove OrdoBucket + GenerateSendDrawer section
old9 = """          {/* Orders Section - Structured Ordo System */}
          <Separator />
          <div className="space-y-3">
            <OrdoBucket
              items={ordoItems}
              onChange={setOrdoItems}
              onGenerateAndSend={() => setShowGenerateSendDrawer(true)}
              problemTitle={problems[0]?.title}
              patientId={patientId}
              consultationId={consultationId}
            />
          </div>

          {/* Generate & Send Drawer */}
          <GenerateSendDrawer
            open={showGenerateSendDrawer}
            onOpenChange={setShowGenerateSendDrawer}
            items={ordoItems}
            patientName={patient?.name || ''}
            patientEmail={patient?.email}
            patientPhone={patient?.phone}
            onSend={async (documents, recipients) => {
              // TODO: Implement actual send logic via API
              console.log('Sending documents:', documents, 'to:', recipients);
              toast.success('Documents envoy\xe9s avec succ\xe8s');
            }}
          />"""
if old9 in content:
    content = content.replace(old9, '')
    changes.append("9. Removed OrdoBucket + GenerateSendDrawer JSX")
else:
    changes.append("9. SKIPPED - OrdoBucket/GenerateSendDrawer not found")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

final_lines = content.count('\n')
print(f"Original: {original_lines} lines -> Final: {final_lines} lines (removed {original_lines - final_lines})")
for c in changes:
    print(c)
print()
print(f"SmartInput remaining: {content.count('SmartInput')}")
print(f"workspaceOrders remaining: {content.count('workspaceOrders')}")
print(f"ordoItems remaining: {content.count('ordoItems')}")
print(f"OrdoBucket remaining: {content.count('OrdoBucket')}")
print(f"GenerateSendDrawer remaining: {content.count('GenerateSendDrawer')}")
print(f"hasAnyLink remaining: {content.count('hasAnyLink')}")
print(f"hasLinkedOrdo remaining: {content.count('hasLinkedOrdo')}")
print(f"hasLinkedOrder remaining: {content.count('hasLinkedOrder')}")
print(f"resolveOrdoCandidates remaining: {content.count('resolveOrdoCandidates')}")
