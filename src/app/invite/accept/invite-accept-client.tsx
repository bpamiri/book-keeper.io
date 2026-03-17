'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { acceptInvite } from '@/app/actions/members'

interface InviteAcceptClientProps {
  clusterNames: string[]
  existingName: string
}

export function InviteAcceptClient({ clusterNames, existingName }: InviteAcceptClientProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState(existingName)
  const [loading, setLoading] = useState(false)
  const hasName = !!existingName

  const clusterList = clusterNames.length === 1
    ? clusterNames[0]
    : clusterNames.slice(0, -1).join(', ') + ' and ' + clusterNames[clusterNames.length - 1]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = fullName.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      const result = await acceptInvite(trimmed)

      if (result.error) {
        toast.error(result.error)
        return
      }

      const clusterId = result.data?.clusterId
      if (clusterId) {
        router.push(`/clusters/${clusterId}`)
      } else {
        router.push('/dashboard')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="size-8" />
            <span className="text-2xl font-bold">BookKeeper</span>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">You&apos;ve been invited!</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join <strong>{clusterList}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!hasName && (
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full Name</Label>
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !fullName.trim()}
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Get Started
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
